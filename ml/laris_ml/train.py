"""Train LarisNet on synthetic shops and export it for the app.

    python -m laris_ml.train --shops 400 --steps 3000 --out ../models/larisnet     # CPU, ~10 min
    python -m laris_ml.train --shops 3000 --steps 40000 --d-model 128 --layers 4 \
        --batch 512 --device cuda --out ../models/larisnet                         # Colab / Kaggle GPU
"""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np
import torch

from . import __version__, calendar_id as cal, synth
from .features import CONTEXT, FUTURE_DIM, HORIZON, PAST_DIM, QUANTILES, STATIC_DIM
from .model import LarisNet, pinball
from .trainset import Store


def to_torch(b: dict[str, np.ndarray], device: str) -> dict[str, torch.Tensor]:
    return {k: torch.from_numpy(v).to(device) for k, v in b.items()}


def loss_on(model: LarisNet, b: dict[str, torch.Tensor]) -> torch.Tensor:
    pred = model(b["past"], b["future"], b["static"], b["mask"])
    return pinball(pred, b["target"] / b["scale"][:, None], b["weight"])


def export_onnx(model: LarisNet, path: Path) -> None:
    model = model.cpu().eval()
    args = (torch.zeros(1, CONTEXT, PAST_DIM), torch.zeros(1, HORIZON, FUTURE_DIM), torch.zeros(1, STATIC_DIM),
            torch.zeros(1, CONTEXT, dtype=torch.bool))
    torch.onnx.export(model, args, str(path), input_names=["past", "future", "static", "mask"],
                      output_names=["quantiles"], opset_version=17, dynamo=False,
                      dynamic_axes={k: {0: "batch"} for k in ["past", "future", "static", "mask", "quantiles"]})


def main(argv: list[str] | None = None) -> dict:
    ap = argparse.ArgumentParser()
    ap.add_argument("--shops", type=int, default=400)
    ap.add_argument("--val-shops", type=int, default=60)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--steps", type=int, default=3000)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--d-model", type=int, default=64)
    ap.add_argument("--layers", type=int, default=3)
    ap.add_argument("--heads", type=int, default=4)
    ap.add_argument("--device", default="cuda" if torch.cuda.is_available() else "cpu")
    ap.add_argument("--threads", type=int, default=0)
    ap.add_argument("--out", default="models/larisnet")
    a = ap.parse_args(argv)
    if a.threads:
        torch.set_num_threads(a.threads)
    torch.manual_seed(a.seed)
    rng = np.random.default_rng(a.seed)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    t0 = time.time()
    train = Store.from_shops(synth.dataset(a.shops, seed=a.seed))
    val = Store.from_shops(synth.dataset(a.val_shops, seed=a.seed + 1000))
    print(f"data: {len(train)} train series, {len(val)} val series, {time.time() - t0:.0f}s", flush=True)
    vb = to_torch(val.batch(np.random.default_rng(0), 2048, short_history_p=0.2), a.device)

    model = LarisNet(a.d_model, a.layers, a.heads, ff=2 * a.d_model).to(a.device)
    n_params = sum(p.numel() for p in model.parameters())
    opt = torch.optim.AdamW(model.parameters(), lr=a.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: min(1.0, (s + 1) / 200) * 0.5 * (1 + math.cos(math.pi * min(s, a.steps) / a.steps)))
    best, history = float("inf"), []
    for step in range(1, a.steps + 1):
        model.train()
        b = to_torch(train.batch(rng, a.batch), a.device)
        loss = loss_on(model, b)
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        sched.step()
        if step % 250 == 0 or step == a.steps:
            model.eval()
            with torch.no_grad():
                vl = float(loss_on(model, vb))
            history.append({"step": step, "train": float(loss), "val": vl})
            print(f"step {step:6d}  train {float(loss):.4f}  val {vl:.4f}  {time.time() - t0:.0f}s", flush=True)
            if vl < best:
                best = vl
                torch.save({"state": model.state_dict(), "config": model.config}, out / "model.pt")

    ckpt = torch.load(out / "model.pt")
    model.load_state_dict(ckpt["state"])
    export_onnx(model, out / "model.onnx")
    meta = {
        "name": "larisnet", "version": __version__, "context": CONTEXT, "horizon": HORIZON,
        "quantiles": list(QUANTILES), "calendar_features": cal.FEATURES, "config": model.config,
        "params": n_params, "train_shops": a.shops, "train_series": len(train), "steps": a.steps,
        "batch": a.batch, "seed": a.seed, "best_val_pinball": best, "history": history,
        "seconds": round(time.time() - t0),
    }
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    print(f"saved {out}/model.onnx ({n_params} parameters, best val {best:.4f})", flush=True)
    return meta


if __name__ == "__main__":
    main()
