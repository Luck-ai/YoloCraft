from __future__ import annotations

import cv2
import numpy as np


def mask_to_polygon(mask: np.ndarray) -> list[list[float]]:
    binary = (mask > 0).astype(np.uint8)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return []

    contour = max(contours, key=cv2.contourArea)
    perimeter = cv2.arcLength(contour, True)
    approx = cv2.approxPolyDP(contour, max(1.5, perimeter * 0.003), True)
    points = approx.reshape(-1, 2)
    if len(points) < 3:
        points = contour.reshape(-1, 2)
    return [[float(x), float(y)] for x, y in points]


def polygon_bbox(polygon: list[list[float]]) -> list[float]:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    return [min(xs), min(ys), max(xs), max(ys)]
