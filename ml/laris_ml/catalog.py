"""Menu items and ingredients of typical Indonesian warung makan and cafés.

Used for synthetic data, the demo shop, and as suggestions when an owner sets up their menu.
Ingredient costs are rough 2026 retail prices in rupiah per base unit (gram, ml or piece).
"""

from __future__ import annotations

from dataclasses import dataclass, field

CATEGORIES = ["makanan", "camilan", "minuman_dingin", "minuman_panas"]
BUSINESS_TYPES = ["warung_makan", "kafe"]


@dataclass(frozen=True)
class Ingredient:
    key: str
    name: str
    unit: str            # g, ml, pcs
    cost: float          # rupiah per unit
    shelf_life_days: int  # usable days after buying
    lead_time_days: int   # days from ordering to having it
    pack: float          # usual purchase size, in units
    pack_name: str


INGREDIENTS = {i.key: i for i in [
    Ingredient("beras", "Beras", "g", 14, 180, 1, 5000, "karung 5 kg"),
    Ingredient("ayam", "Daging ayam", "g", 38, 2, 1, 1000, "kg"),
    Ingredient("telur", "Telur", "pcs", 2000, 14, 1, 10, "10 butir"),
    Ingredient("mie_instan", "Mi instan", "pcs", 3500, 180, 1, 40, "dus (40)"),
    Ingredient("mie_kuning", "Mi kuning basah", "g", 18, 3, 1, 1000, "kg"),
    Ingredient("bakso", "Bakso", "pcs", 1500, 3, 1, 50, "50 butir"),
    Ingredient("sayur", "Sayuran", "g", 15, 3, 1, 1000, "kg"),
    Ingredient("tahu", "Tahu", "pcs", 800, 2, 1, 10, "10 potong"),
    Ingredient("tempe", "Tempe", "g", 15, 2, 1, 500, "papan 500 g"),
    Ingredient("bumbu", "Bumbu dasar", "g", 40, 7, 1, 500, "500 g"),
    Ingredient("cabai", "Cabai & sambal", "g", 60, 5, 1, 250, "250 g"),
    Ingredient("minyak", "Minyak goreng", "ml", 18, 180, 1, 2000, "2 liter"),
    Ingredient("kecap", "Kecap manis", "ml", 30, 180, 1, 600, "botol 600 ml"),
    Ingredient("kacang", "Kacang tanah", "g", 35, 30, 1, 1000, "kg"),
    Ingredient("pisang", "Pisang", "pcs", 1500, 4, 1, 15, "sisir"),
    Ingredient("tepung", "Tepung terigu", "g", 12, 120, 1, 1000, "kg"),
    Ingredient("roti", "Roti tawar", "pcs", 1000, 4, 1, 20, "bungkus (20 lembar)"),
    Ingredient("teh", "Teh celup", "pcs", 300, 365, 2, 50, "kotak (50)"),
    Ingredient("gula", "Gula pasir", "g", 17, 365, 1, 1000, "kg"),
    Ingredient("es", "Es batu", "g", 2, 1, 0, 5000, "5 kg"),
    Ingredient("jeruk", "Jeruk peras", "pcs", 1500, 7, 1, 20, "20 buah"),
    Ingredient("alpukat", "Alpukat", "pcs", 6000, 4, 1, 10, "10 buah"),
    Ingredient("susu", "Susu segar/UHT", "ml", 20, 7, 1, 1000, "liter"),
    Ingredient("skm", "Susu kental manis", "g", 30, 60, 1, 490, "kaleng 490 g"),
    Ingredient("kopi", "Biji kopi", "g", 150, 60, 3, 1000, "kg"),
    Ingredient("gula_aren", "Sirup gula aren", "ml", 40, 30, 2, 1000, "liter"),
    Ingredient("matcha", "Bubuk matcha", "g", 600, 90, 5, 100, "100 g"),
    Ingredient("coklat", "Bubuk coklat", "g", 120, 180, 3, 500, "500 g"),
    Ingredient("kentang", "Kentang goreng beku", "g", 35, 90, 2, 1000, "kg"),
    Ingredient("keju", "Keju", "g", 120, 30, 2, 170, "blok 170 g"),
    Ingredient("mentega", "Mentega", "g", 60, 60, 2, 200, "200 g"),
]}


@dataclass(frozen=True)
class MenuItem:
    key: str
    name: str
    category: str
    price: int
    popularity: float                  # relative share of orders
    recipe: dict[str, float] = field(default_factory=dict)  # ingredient key -> units per portion


WARUNG_MENU = [
    MenuItem("nasgor", "Nasi Goreng Ayam", "makanan", 18000, 1.4,
             {"beras": 150, "ayam": 50, "telur": 1, "bumbu": 15, "minyak": 15, "kecap": 10, "sayur": 20}),
    MenuItem("miegor", "Mie Goreng", "makanan", 15000, 0.9,
             {"mie_kuning": 120, "telur": 1, "sayur": 30, "bumbu": 10, "minyak": 15, "kecap": 10}),
    MenuItem("geprek", "Ayam Geprek", "makanan", 20000, 1.5,
             {"beras": 150, "ayam": 120, "tepung": 40, "minyak": 40, "cabai": 25}),
    MenuItem("soto", "Soto Ayam", "makanan", 17000, 0.8, {"beras": 150, "ayam": 60, "sayur": 30, "bumbu": 20}),
    MenuItem("nascam", "Nasi Campur", "makanan", 22000, 1.0,
             {"beras": 170, "ayam": 60, "telur": 1, "tempe": 40, "tahu": 1, "sayur": 40, "bumbu": 15, "minyak": 20}),
    MenuItem("gado", "Gado-gado", "makanan", 15000, 0.5,
             {"sayur": 120, "tahu": 1, "tempe": 40, "telur": 1, "kacang": 50, "gula": 5}),
    MenuItem("bakso", "Bakso", "makanan", 15000, 0.8, {"bakso": 6, "mie_kuning": 50, "sayur": 20, "bumbu": 10}),
    MenuItem("indomie", "Indomie Rebus Telur", "makanan", 12000, 0.7, {"mie_instan": 1, "telur": 1, "sayur": 20}),
    MenuItem("tempegor", "Tempe Goreng", "camilan", 5000, 0.6, {"tempe": 60, "tepung": 20, "minyak": 20}),
    MenuItem("pisgor", "Pisang Goreng", "camilan", 5000, 0.6, {"pisang": 1, "tepung": 25, "minyak": 20, "gula": 5}),
    MenuItem("esteh", "Es Teh Manis", "minuman_dingin", 5000, 2.0, {"teh": 1, "gula": 25, "es": 150}),
    MenuItem("tehpanas", "Teh Panas", "minuman_panas", 4000, 0.6, {"teh": 1, "gula": 20}),
    MenuItem("esjeruk", "Es Jeruk", "minuman_dingin", 8000, 0.8, {"jeruk": 3, "gula": 20, "es": 150}),
    MenuItem("kopi", "Kopi Hitam", "minuman_panas", 5000, 0.5, {"kopi": 12, "gula": 15}),
    MenuItem("jusalpukat", "Jus Alpukat", "minuman_dingin", 15000, 0.4, {"alpukat": 1, "skm": 30, "gula": 10, "es": 150}),
]

KAFE_MENU = [
    MenuItem("kopsus", "Es Kopi Susu Gula Aren", "minuman_dingin", 22000, 2.2,
             {"kopi": 18, "susu": 150, "gula_aren": 25, "es": 150}),
    MenuItem("americano", "Es Americano", "minuman_dingin", 20000, 0.9, {"kopi": 18, "es": 150}),
    MenuItem("cappuccino", "Cappuccino", "minuman_panas", 25000, 0.7, {"kopi": 18, "susu": 150}),
    MenuItem("matcha", "Matcha Latte", "minuman_dingin", 28000, 0.9, {"matcha": 4, "susu": 180, "gula": 15, "es": 150}),
    MenuItem("coklat", "Coklat Panas", "minuman_panas", 22000, 0.5, {"coklat": 25, "susu": 180, "gula": 10}),
    MenuItem("esteh_kafe", "Es Teh Lemon", "minuman_dingin", 12000, 0.8, {"teh": 1, "gula": 20, "jeruk": 1, "es": 150}),
    MenuItem("kopitubruk", "Kopi Tubruk", "minuman_panas", 12000, 0.4, {"kopi": 15, "gula": 15}),
    MenuItem("rotibakar", "Roti Bakar Coklat Keju", "camilan", 18000, 0.8,
             {"roti": 2, "mentega": 10, "coklat": 15, "keju": 15, "skm": 15}),
    MenuItem("kentang", "Kentang Goreng", "camilan", 18000, 0.9, {"kentang": 150, "minyak": 30}),
    MenuItem("pisgorkeju", "Pisang Goreng Keju", "camilan", 18000, 0.6,
             {"pisang": 2, "tepung": 30, "minyak": 25, "keju": 15, "skm": 15}),
    MenuItem("nasgor_kafe", "Nasi Goreng Kampung", "makanan", 28000, 0.8,
             {"beras": 150, "ayam": 50, "telur": 1, "bumbu": 15, "minyak": 15, "kecap": 10, "sayur": 20}),
    MenuItem("miegor_kafe", "Mie Goreng Jawa", "makanan", 25000, 0.6,
             {"mie_kuning": 120, "telur": 1, "sayur": 30, "bumbu": 10, "minyak": 15, "kecap": 10}),
    MenuItem("indomie_kafe", "Indomie Telur Keju", "makanan", 18000, 0.6, {"mie_instan": 1, "telur": 1, "keju": 15}),
]

MENUS = {"warung_makan": WARUNG_MENU, "kafe": KAFE_MENU}
