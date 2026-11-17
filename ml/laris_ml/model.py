"""LarisNet: a small transformer that reads the last 8 weeks of an item's sales and the calendar of
the next 4 weeks, and predicts quantiles of daily sales for each of those 28 days.

Past days and future days are tokens of one sequence: past tokens carry sales, future tokens
carry what is known ahead (day of week, payday, Ramadan, Lebaran, holidays, planned closures and
promos). Attention lets every future day look at the history and at the other future days.
The head outputs non-negative, non-crossing quantiles (each one adds a positive step to the
previous), in units of the item's recent average, which the caller multiplies back.
"""

from __future__ import annotations

import torch
from torch import nn

from .features import CONTEXT, FUTURE_DIM, HORIZON, PAST_DIM, QUANTILES, STATIC_DIM


class LarisNet(nn.Module):
    def __init__(self, d_model: int = 64, layers: int = 3, heads: int = 4, ff: int = 128, dropout: float = 0.1):
        super().__init__()
        self.config = dict(d_model=d_model, layers=layers, heads=heads, ff=ff, dropout=dropout)
        self.past_in = nn.Linear(PAST_DIM + STATIC_DIM, d_model)
        self.future_in = nn.Linear(FUTURE_DIM + STATIC_DIM, d_model)
        self.pos = nn.Parameter(torch.randn(CONTEXT + HORIZON, d_model) * 0.02)
        layer = nn.TransformerEncoderLayer(d_model, heads, ff, dropout, batch_first=True, norm_first=True)
        self.encoder = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(d_model)
        self.head = nn.Linear(d_model, len(QUANTILES))

    def forward(self, past: torch.Tensor, future: torch.Tensor, static: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
        """past (B,C,P) future (B,H,F) static (B,S) mask (B,C) bool, True = padding -> (B,H,Q) scaled quantiles."""
        b = past.shape[0]
        sp = static.unsqueeze(1).expand(b, CONTEXT, static.shape[-1])
        sf = static.unsqueeze(1).expand(b, HORIZON, static.shape[-1])
        x = torch.cat([self.past_in(torch.cat([past, sp], -1)), self.future_in(torch.cat([future, sf], -1))], 1)
        x = x + self.pos
        pad = torch.cat([mask, torch.zeros(b, HORIZON, dtype=torch.bool, device=mask.device)], 1)
        h = self.encoder(x, src_key_padding_mask=pad)
        z = self.head(self.norm(h[:, CONTEXT:]))
        steps = nn.functional.softplus(z)
        return torch.cumsum(steps, -1)


def pinball(pred: torch.Tensor, target: torch.Tensor, weight: torch.Tensor) -> torch.Tensor:
    """Quantile loss averaged over the days with weight 1. pred (B,H,Q), target/weight (B,H)."""
    q = torch.tensor(QUANTILES, device=pred.device, dtype=pred.dtype)
    diff = target.unsqueeze(-1) - pred
    loss = torch.maximum(q * diff, (q - 1) * diff).mean(-1)
    return (loss * weight).sum() / weight.sum().clamp(min=1)
