"""Sample goods for a kios / toko kelontong. A shop sells goods as they were bought, so each item
is its own stock: selling one takes one off the shelf, and the shopping list reorders by the pack."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Good:
    key: str
    name: str
    category: str
    price: int          # selling price per piece
    pack: int           # pieces per pack bought
    pack_name: str
    pack_price: int     # price paid for one pack
    shelf_life_days: int
    lead_time_days: int


GOODS = [
    Good("k_beras", "Beras 5 kg", "sembako", 80_000, 1, "karung 5 kg", 74_000, 180, 1),
    Good("k_minyak", "Minyak goreng 1 liter", "sembako", 20_000, 12, "dus (12)", 210_000, 270, 1),
    Good("k_gula", "Gula pasir 1 kg", "sembako", 19_000, 10, "bal (10)", 165_000, 365, 1),
    Good("k_telur", "Telur 1 kg", "sembako", 30_000, 1, "kg", 27_000, 14, 0),
    Good("k_mi", "Mi instan", "sembako", 3_500, 40, "dus (40)", 116_000, 180, 1),
    Good("k_kopi", "Kopi sachet", "minuman_panas", 2_000, 10, "renceng (10)", 15_000, 365, 1),
    Good("k_air", "Air mineral 600 ml", "minuman_dingin", 4_000, 24, "dus (24)", 65_000, 365, 1),
    Good("k_teh", "Teh botol", "minuman_dingin", 5_000, 24, "krat (24)", 91_000, 180, 1),
    Good("k_roti", "Roti bungkus", "camilan", 6_000, 10, "pak (10)", 48_000, 4, 1),
    Good("k_snack", "Snack ringan", "camilan", 2_000, 10, "renceng (10)", 14_000, 120, 1),
    Good("k_gas", "Gas LPG 3 kg", "kebutuhan_rumah", 23_000, 1, "tabung", 20_000, 3650, 1),
    Good("k_sabun", "Sabun mandi", "kebutuhan_rumah", 4_000, 12, "lusin (12)", 37_000, 730, 1),
    Good("k_deterjen", "Deterjen sachet", "kebutuhan_rumah", 1_500, 12, "renceng (12)", 13_000, 730, 1),
]
BY_KEY = {g.key: g for g in GOODS}
