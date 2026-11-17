"""Run the exported model with onnxruntime: no PyTorch needed in the app."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .features import QUANTILES, Window, stack


class Forecaster:
    def __init__(self, model_dir: str | Path):
        import onnxruntime as ort

        model_dir = Path(model_dir)
        self.meta = json.loads((model_dir / "meta.json").read_text())
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        self.session = ort.InferenceSession(str(model_dir / "model.onnx"), opts, providers=["CPUExecutionProvider"])
        self.quantiles = tuple(self.meta["quantiles"])
        assert self.quantiles == QUANTILES, "model and code disagree on quantiles"

    def predict(self, windows: list[Window], batch: int = 256) -> np.ndarray:
        """Quantiles of daily sales, shape (len(windows), HORIZON, len(QUANTILES)); closed days are 0."""
        outs = []
        for i in range(0, len(windows), batch):
            s = stack(windows[i:i + batch])
            q = self.session.run(["quantiles"], {"past": s["past"], "future": s["future"], "static": s["static"],
                                                 "mask": s["mask"]})[0]
            q = q * s["scale"][:, None, None]
            q[s["future"][..., 0] > 0] = 0  # planned closed days
            outs.append(q)
        return np.concatenate(outs) if outs else np.zeros((0, 0, len(QUANTILES)))
