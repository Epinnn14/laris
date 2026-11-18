"""Tables. Stock is not a number on the ingredient but the sum of its movements, so every change
(buying, using, throwing away, a stock count) leaves a trace and can be corrected."""

from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Setting(Base):
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(2000))


class MenuItem(Base):
    __tablename__ = "menu_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(32))  # makanan, camilan, minuman_dingin, minuman_panas
    price: Mapped[int] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    # simple cost: "I spend batch_cost and it makes batch_qty portions ready to sell".
    # When set it is the item's cost; the recipe then only moves stock.
    batch_cost: Mapped[float | None] = mapped_column(Float, nullable=True)
    batch_qty: Mapped[float | None] = mapped_column(Float, nullable=True)
    created: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    recipe: Mapped[list["RecipeLine"]] = relationship(back_populates="item", cascade="all, delete-orphan")


class Ingredient(Base):
    __tablename__ = "ingredients"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    unit: Mapped[str] = mapped_column(String(16))         # g, ml, pcs
    cost_per_unit: Mapped[float] = mapped_column(Float)   # rupiah per unit
    shelf_life_days: Mapped[int] = mapped_column(Integer, default=7)
    lead_time_days: Mapped[int] = mapped_column(Integer, default=1)
    pack_size: Mapped[float] = mapped_column(Float, default=1)
    pack_name: Mapped[str] = mapped_column(String(60), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class RecipeLine(Base):
    __tablename__ = "recipe_lines"
    __table_args__ = (UniqueConstraint("item_id", "ingredient_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id", ondelete="CASCADE"))
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id", ondelete="CASCADE"))
    amount: Mapped[float] = mapped_column(Float)  # units of the ingredient per portion
    item: Mapped[MenuItem] = relationship(back_populates="recipe")
    ingredient: Mapped[Ingredient] = relationship()


class DailySale(Base):
    __tablename__ = "daily_sales"
    __table_args__ = (UniqueConstraint("day", "item_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id", ondelete="CASCADE"), index=True)
    qty: Mapped[int] = mapped_column(Integer, default=0)
    stockout: Mapped[bool] = mapped_column(Boolean, default=False)  # ran out before closing
    promo: Mapped[bool] = mapped_column(Boolean, default=False)


class DayStatus(Base):
    """A day the shop is (or will be) closed, with an optional note. Future rows are planned closures."""
    __tablename__ = "day_status"
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    closed: Mapped[bool] = mapped_column(Boolean, default=True)
    note: Mapped[str] = mapped_column(String(200), default="")


class PromoPlan(Base):
    __tablename__ = "promo_plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id", ondelete="CASCADE"))
    start: Mapped[date] = mapped_column(Date)
    end: Mapped[date] = mapped_column(Date)
    note: Mapped[str] = mapped_column(String(200), default="")


class StockMove(Base):
    """kind: beli (bought, +), pakai (used by recorded sales, -), buang (spoiled/wasted, -),
    opname (stock count correction, +/-)."""
    __tablename__ = "stock_moves"
    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    ingredient_id: Mapped[int] = mapped_column(ForeignKey("ingredients.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(16))
    qty: Mapped[float] = mapped_column(Float)    # signed, in the ingredient's unit
    cost: Mapped[float] = mapped_column(Float, default=0)  # rupiah paid (beli)
    note: Mapped[str] = mapped_column(String(200), default="")
    auto: Mapped[bool] = mapped_column(Boolean, default=False)  # created from recorded sales


class Expense(Base):
    """Money spent on running the shop that is not an ingredient: gas, electricity, rent, wages,
    packaging, transport. Ingredients are tracked as stock, so net profit does not count them twice."""
    __tablename__ = "expenses"
    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    category: Mapped[str] = mapped_column(String(32))  # gas, listrik_air, sewa, gaji, kemasan, transport, lainnya
    amount: Mapped[float] = mapped_column(Float)
    note: Mapped[str] = mapped_column(String(200), default="")


class Order(Base):
    """One sale at the till. Saving it adds its portions to the day's totals (DailySale), so
    the dashboard, stock and forecasts work the same whether the owner uses the till or
    types the day's totals in the evening."""
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    number: Mapped[int] = mapped_column(Integer)           # 1, 2, 3 ... within the day
    created: Mapped[datetime] = mapped_column(DateTime)    # local shop time
    total: Mapped[int] = mapped_column(Integer)
    method: Mapped[str] = mapped_column(String(16), default="tunai")  # tunai, qris, transfer
    cash: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note: Mapped[str] = mapped_column(String(200), default="")
    void: Mapped[bool] = mapped_column(Boolean, default=False)
    lines: Mapped[list["OrderLine"]] = relationship(back_populates="order", cascade="all, delete-orphan")


class OrderLine(Base):
    __tablename__ = "order_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int] = mapped_column(ForeignKey("menu_items.id", ondelete="CASCADE"))
    qty: Mapped[int] = mapped_column(Integer)
    price: Mapped[int] = mapped_column(Integer)  # price at the time of sale
    order: Mapped[Order] = relationship(back_populates="lines")


class PreOrder(Base):
    """A special order outside the daily trade: a catering box order, a birthday, an office
    lunch. It is kept out of the forecast's history (it is not a normal day), its ingredients
    are added to the shopping list before it is due, and its money counts once it is done."""
    __tablename__ = "preorders"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(40), default="")
    due: Mapped[date] = mapped_column(Date, index=True)
    due_time: Mapped[str] = mapped_column(String(5), default="")   # "HH:MM"
    status: Mapped[str] = mapped_column(String(16), default="baru")  # baru, proses, selesai, batal
    dp: Mapped[int] = mapped_column(Integer, default=0)              # down payment received
    note: Mapped[str] = mapped_column(String(500), default="")
    created: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    lines: Mapped[list["PreOrderLine"]] = relationship(back_populates="preorder", cascade="all, delete-orphan")


class PreOrderLine(Base):
    __tablename__ = "preorder_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    preorder_id: Mapped[int] = mapped_column(ForeignKey("preorders.id", ondelete="CASCADE"), index=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("menu_items.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(120))
    qty: Mapped[int] = mapped_column(Integer)
    price: Mapped[int] = mapped_column(Integer)
    preorder: Mapped[PreOrder] = relationship(back_populates="lines")


class Note(Base):
    """A note on the dashboard board: anything the owner wants to keep in sight."""
    __tablename__ = "notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    text: Mapped[str] = mapped_column(String(2000))
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    updated: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
