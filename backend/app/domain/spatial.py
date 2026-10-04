"""Local scouting-priority grid and ranked scouting points as GeoJSON (WGS84, [lon, lat]).

Priority is a relative 0-1 layout score for where to look next, not an infection probability.
Uses an equirectangular local tangent plane, adequate for the few hundred metres covered.
"""
import math

EARTH_M = 6371000.0
BEARINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def to_local(lat0, lon0, lat, lon) -> tuple[float, float]:
    """(east_m, north_m) of (lat, lon) relative to origin."""
    north = math.radians(lat - lat0) * EARTH_M
    east = math.radians(lon - lon0) * EARTH_M * math.cos(math.radians(lat0))
    return east, north


def to_geo(lat0, lon0, east, north) -> tuple[float, float]:
    lat = lat0 + math.degrees(north / EARTH_M)
    lon = lon0 + math.degrees(east / (EARTH_M * math.cos(math.radians(lat0))))
    return lat, lon


def grid_supported(lat0: float, lon0: float, half_extent_m: float) -> bool:
    """The equirectangular local plane breaks down near the poles and must not wrap the antimeridian."""
    if abs(lat0) > 85:
        return False
    lat_n, lon_e = to_geo(lat0, lon0, half_extent_m, half_extent_m)
    lat_s, lon_w = to_geo(lat0, lon0, -half_extent_m, -half_extent_m)
    return -90 <= lat_s and lat_n <= 90 and -180 <= lon_w and lon_e <= 180


def bearing_label(east: float, north: float) -> str:
    angle = math.degrees(math.atan2(east, north)) % 360
    return BEARINGS[int((angle + 22.5) // 45) % 8]


def effective_distance(dx: float, dy: float, downwind: tuple[float, float] | None, stretch: float) -> float:
    """Distance shortened along the downwind direction (unit vector), so downwind cells rank higher."""
    if downwind is None or stretch <= 0:
        return math.hypot(dx, dy)
    along = dx * downwind[0] + dy * downwind[1]
    across = -dx * downwind[1] + dy * downwind[0]
    if along > 0:
        along /= 1 + stretch
    return math.hypot(along, across)


def priority_grid(origin: tuple[float, float], sources: list[dict], cleared: list[dict], model: dict,
                  wind_from_deg: float | None) -> list[dict]:
    """sources/cleared: dicts with latitude/longitude. Returns cells sorted row-major with priority in [0, 1]."""
    lat0, lon0 = origin
    size, half, decay = model["cell_size_m"], model["half_width_cells"], model["decay_length_m"]
    size = model.get("effective_cell_size_m", size)
    decay = model.get("effective_decay_length_m", decay)
    downwind = None
    if wind_from_deg is not None:
        to_rad = math.radians((wind_from_deg + 180) % 360)
        downwind = (math.sin(to_rad), math.cos(to_rad))
    src = [to_local(lat0, lon0, s["latitude"], s["longitude"]) for s in sources]
    clr = [to_local(lat0, lon0, c["latitude"], c["longitude"]) for c in cleared]
    cells = []
    for row in range(-half, half + 1):
        for col in range(-half, half + 1):
            east, north = col * size, row * size
            p = max((math.exp(-effective_distance(east - sx, north - sy, downwind, model["downwind_stretch"]) / decay)
                     for sx, sy in src), default=0.0)
            for cx, cy in clr:  # recently inspected and clear: lower (not remove) priority nearby
                p *= 1 - 0.5 * math.exp(-math.hypot(east - cx, north - cy) / decay)
            cells.append({"row": row, "col": col, "east_m": east, "north_m": north, "priority": round(p, 4)})
    return cells


def cell_polygon(lat0, lon0, east, north, size) -> list[list[float]]:
    h = size / 2
    corners = [(east - h, north - h), (east + h, north - h), (east + h, north + h), (east - h, north + h), (east - h, north - h)]
    return [[round(lon, 7), round(lat, 7)] for lat, lon in (to_geo(lat0, lon0, e, n) for e, n in corners)]


def pick_points(cells: list[dict], count: int = 5, min_separation_m: float = 40.0) -> list[dict]:
    """Greedy highest-priority cells with a minimum spacing; deterministic tie-break by distance then position."""
    ranked = sorted(cells, key=lambda c: (-c["priority"], math.hypot(c["east_m"], c["north_m"]), c["row"], c["col"]))
    chosen = []
    for cell in ranked:
        if cell["priority"] <= 0:
            break
        if all(math.hypot(cell["east_m"] - c["east_m"], cell["north_m"] - c["north_m"]) >= min_separation_m for c in chosen):
            chosen.append(cell)
        if len(chosen) == count:
            break
    return chosen


def effective_geometry(model: dict, uncertainty_m: float) -> tuple[float, float]:
    """Cell size and kernel length consistent with positional uncertainty r (metres).

    Cells are never finer than r (rounded up to 10 m): a 20 m grid from a 100 m position would be false precision.
    The exponential kernel is broadened by the position error with the variance-addition approximation
    L_eff = sqrt(L^2 + r^2) (exact for Gaussian kernels; an approximation for exponential ones).
    """
    cell = max(float(model["cell_size_m"]), 10.0 * math.ceil(uncertainty_m / 10.0))
    return cell, math.hypot(float(model["decay_length_m"]), uncertainty_m)


def circle_polygon(lat0, lon0, radius_m, segments=32) -> list[list[float]]:
    pts = []
    for i in range(segments + 1):
        a = 2 * math.pi * i / segments
        lat, lon = to_geo(lat0, lon0, radius_m * math.sin(a), radius_m * math.cos(a))
        pts.append([round(lon, 7), round(lat, 7)])
    return pts
