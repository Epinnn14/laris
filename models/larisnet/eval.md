**Normal weeks** (1278 forecasts of 28 days)

| Method | MASE | wQL | 80% band coverage | MAE (portions/day) |
|---|---|---|---|---|
| LarisNet | 0.66 | 0.19 | 79% | 8.77 |
| Same day last week | 1.019 | 0.331 | 76% | 14.47 |
| Weekday average (8 wk) | 0.778 | 0.241 | 64% | 10.51 |
| LightGBM (lags + calendar) | 0.693 | 0.2 | 79% | 9.23 |

**Around Lebaran** (2522 forecasts of 28 days)

| Method | MASE | wQL | 80% band coverage | MAE (portions/day) |
|---|---|---|---|---|
| LarisNet | 0.592 | 0.202 | 79% | 6.78 |
| Same day last week | 0.985 | 0.354 | 78% | 11.54 |
| Weekday average (8 wk) | 0.799 | 0.294 | 59% | 9.33 |
| LightGBM (lags + calendar) | 0.627 | 0.216 | 77% | 7.19 |

**New items (14 days of history)** (1296 forecasts of 28 days)

| Method | MASE | wQL | 80% band coverage | MAE (portions/day) |
|---|---|---|---|---|
| LarisNet | 0.304 | 0.211 | 80% | 7.62 |
| Same day last week | 0.46 | 0.393 | 55% | 12.68 |
| Weekday average (8 wk) | 0.391 | 0.355 | 28% | 9.96 |
| LightGBM (lags + calendar) | 0.343 | 0.244 | 76% | 8.65 |
