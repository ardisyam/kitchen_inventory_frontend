import React, { useEffect, useState } from "react";
import {
  Stage,
  Layer,
  Rect,
  Image as KonvaImage,
  Text,
  Line,
} from "react-konva";
import useImage from "use-image";

export default function TestKonva() {
  const [imageUrl, setImageUrl] = useState(null);
  const [image] = useImage(imageUrl);

  const [rectangles, setRectangles] = useState([]);
  const [newRect, setNewRect] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentLabel, setCurrentLabel] = useState("title");

  const [recipeScanId, setRecipeScanId] = useState("RSCN_DEMO_001");

  // ------------------------------------------------------------
  // Load saved regions from DB
  // ------------------------------------------------------------
    // ------------------------------------------------------------
    // Manual region loading only
    // ------------------------------------------------------------
    const loadRegions = async () => {
      try {
        const token = localStorage.getItem("access_token_admin");
        const actorId = localStorage.getItem("admin_user_id");

        if (!token) {
          console.log("No token yet, skipping region load");
          return;
        }

        const response = await fetch(
          `http://localhost:5000/api/recipe-scans/${recipeScanId}/regions?limit=100`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
              "X-Actor-Id": actorId,
            },
          }
        );

        const result = await response.json();

        console.log("Loaded regions:", result);

        if (!response.ok) {
          console.log("Load regions failed:", result);
          return;
        }

        const items = result.items || [];

        const loadedRects = items
          .map((r) => {
            const frontendType =
              r.label === "serves" && r.region_type === "notes"
                ? "serves"
                : r.region_type || "unknown";

            const x = Number(r.x);
            const y = Number(r.y);
            const width = Number(r.width);
            const height = Number(r.height);

            if (
              Number.isNaN(x) ||
              Number.isNaN(y) ||
              Number.isNaN(width) ||
              Number.isNaN(height)
            ) {
              return null;
            }

            return {
              id: r.id,
              x: width < 0 ? x + width : x,
              y: height < 0 ? y + height : y,
              width: Math.abs(width),
              height: Math.abs(height),
              split_x: r.split_x == null ? null : Number(r.split_x),
              region_type: frontendType,
              label: r.label || frontendType,
              ocr_text: r.ocr_text || "",
              parsed_json: r.parsed_json || null,
              confidence: r.confidence || null,
            };
          })
          .filter(Boolean);

        setRectangles(loadedRects);
      } catch (err) {
        console.error("Load regions error:", err);
      }
    };

  const handleMouseDown = (e) => {
    if (!image) return;

    const stage = e.target.getStage();
    const rawPos = stage.getPointerPosition();

    const pos = {
      x: rawPos.x / scale,
      y: rawPos.y / scale,
    };

    setIsDrawing(true);

    setNewRect({
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      region_type: currentLabel,
      label: currentLabel,
      split_x: currentLabel === "ingredient_row" ? 180 : null,
    });
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !newRect) return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    setNewRect({
      ...newRect,
      width: pos.x - newRect.x,
      height: pos.y - newRect.y,
    });
  };

  const handleMouseUp = () => {
    if (!newRect) return;

    const fixedRect = {
      ...newRect,
      width: Math.abs(newRect.width),
      height: Math.abs(newRect.height),
      x: newRect.width < 0 ? newRect.x + newRect.width : newRect.x,
      y: newRect.height < 0 ? newRect.y + newRect.height : newRect.y,
    };

    if (fixedRect.width < 5 || fixedRect.height < 5) {
      setNewRect(null);
      setIsDrawing(false);
      return;
    }

    setRectangles((prev) => [...prev, fixedRect]);
    setNewRect(null);
    setIsDrawing(false);
  };

  const handleUndo = () => {
    setRectangles((prev) => prev.slice(0, -1));
  };

  const updateRectanglePosition = (index, x, y) => {
    setRectangles((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        x,
        y,
      };
      return updated;
    });
  };

  const updateSplitX = (index, absoluteX) => {
    setRectangles((prev) => {
      const updated = [...prev];
      const rect = updated[index];

      let newSplitX = absoluteX - rect.x;

      if (newSplitX < 10) newSplitX = 10;
      if (newSplitX > rect.width - 10) newSplitX = rect.width - 10;

      updated[index] = {
        ...rect,
        split_x: newSplitX,
      };

      return updated;
    });
  };

  const handleSave = async () => {
    try {
      const payload = {
        regions: rectangles.map((r, index) => {
          const safeWidth = Math.max(10, Math.min(r.width, 1100));
          const safeHeight = Math.max(10, Math.min(r.height, 1600));

          const safeX = Math.max(0, r.x);
          const safeY = Math.max(0, r.y);

          return {
            region_type:
              r.region_type === "serves"
                ? "notes"
                : r.region_type || r.label || "unknown",

            label:
              r.region_type === "serves"
                ? "serves"
                : r.label || r.region_type || `Region ${index + 1}`,

            sort_order: index + 1,

            x: Math.round(safeX),
            y: Math.round(safeY),

            width: Math.round(safeWidth),
            height: Math.round(safeHeight),

            split_x:
              r.region_type === "ingredient_row"
                ? Math.round(r.split_x ?? 180)
                : null,

            ocr_text: r.ocr_text || "",
            parsed_json: r.parsed_json || null,
            confidence: r.confidence || null,
          };
        }),
      };

      const validTypes = [
        "title",
        "ingredients",
        "ingredient_row",
        "instruction",
        "instructions",
        "notes",
        "image",
        "unknown",
      ];

      const bad = payload.regions.find(
        (r) => !validTypes.includes(r.region_type)
      );

      if (bad) {
        alert(`Invalid frontend region_type: ${bad.region_type}`);
        console.log("Bad region:", bad);
        return;
      }

      console.log("Saving payload:", payload);

      const token = localStorage.getItem("access_token_admin");
      const actorId = localStorage.getItem("admin_user_id");

      const response = await fetch(
        `http://localhost:5000/api/recipe-scans/${recipeScanId}/regions/bulk`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-Actor-Id": actorId,
          },
          body: JSON.stringify(payload),
        }
      );

      const text = await response.text();

      let result;
      try {
        result = JSON.parse(text);
      } catch {
        result = { raw: text };
      }

      console.log("Save status:", response.status);
      console.log("Save result:", result);

      if (!response.ok) {
        alert(`Save failed: ${result.message || result.error || response.status}`);
        return;
      }

      alert("Save successful!");
    } catch (err) {
      console.error("Save error:", err);
      alert("Save failed. Check Flask server.");
    }
  };

    const MAX_VIEWPORT_WIDTH = Math.min(window.innerWidth - 40, 900);

    const scale = image
      ? Math.min(1, MAX_VIEWPORT_WIDTH / image.width)
      : 1;

    const stageWidth = image
      ? image.width * scale
      : 1200;

    const stageHeight = image
      ? image.height * scale
      : 1800;

   return (

    <div style={{ padding: 20 }}>
      <h2>Recipe Scan Region Editor</h2>

      <div style={{ marginBottom: 10 }}>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setImageUrl(URL.createObjectURL(file));
          }}
        />
      </div>

      <div
        style={{
          marginBottom: 10,
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <button onClick={loadRegions}>Load</button>
        <button onClick={() => setCurrentLabel("title")}>Title</button>
        <button onClick={() => setCurrentLabel("notes")}>Notes</button>
        <button onClick={() => setCurrentLabel("serves")}>Serves</button>
        <button onClick={() => setCurrentLabel("ingredient_row")}>
          Ingredient Row
        </button>
        <button onClick={() => setCurrentLabel("instructions")}>
          Instructions
        </button>
        <button onClick={handleUndo}>Undo</button>
        <button onClick={handleSave}>Save</button>
      </div>

      <div style={{ marginBottom: 10 }}>
        Current Label: <b>{currentLabel}</b>
      </div>

      <Stage
        width={stageWidth}
        height={stageHeight}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{
          border: "1px solid #999",
          background: "#eee",
        }}
      >
        <Layer>
          {image && (
            <KonvaImage
              image={image}
              x={0}
              y={0}
              width={image.width * scale}
              height={image.height * scale}
              listening={false}
            />
          )}

          {rectangles.map((rect, index) => {
            const splitAbsX = (rect.x + (rect.split_x ?? 180)) * scale;

            return (
              <React.Fragment key={index}>
                <Rect
                 x={rect.x * scale}
                 y={rect.y * scale}
                 width={rect.width * scale}
                 height={rect.height * scale}
                  stroke="red"
                  strokeWidth={2}
                  draggable
                  onDragEnd={(e) => {
                    updateRectanglePosition(
                      index,
                      e.target.x() / scale,
                      e.target.y() / scale
                    );
                  }}
                />

                <Text
                  x={rect.x}
                  y={rect.y - 20}
                  text={rect.label}
                  fill="red"
                  fontSize={18}
                  listening={false}
                />

                {rect.region_type === "ingredient_row" && (
                  <>
                    <Line
                      points={[
                        splitAbsX,
                        rect.y,
                        splitAbsX,
                        rect.y + rect.height,
                      ]}
                      stroke="red"
                      strokeWidth={2}
                      dash={[4, 4]}
                      listening={false}
                    />

                    <Rect
                      x={splitAbsX - 5}
                      y={rect.y}
                      width={10}
                      height={rect.height}
                      fill="rgba(255,0,0,0.15)"
                      stroke="red"
                      strokeWidth={1}
                      draggable
                      dragBoundFunc={(pos) => ({
                        x: Math.max(
                          rect.x + 10 - 5,
                          Math.min(pos.x, rect.x + rect.width - 10 - 5)
                        ),
                        y: rect.y,
                      })}
                      onDragMove={(e) => {
                        updateSplitX(index, (e.target.x() + 5) / scale);
                      }}
                      onDragEnd={(e) => {
                        updateSplitX(index, (e.target.x() + 5) / scale);
                      }}
                    />
                  </>
                )}
              </React.Fragment>
            );
          })}

          {newRect && (
            <>
              <Rect
                x={newRect.x}
                y={newRect.y}
                width={newRect.width}
                height={newRect.height}
                stroke="blue"
                dash={[5, 5]}
                strokeWidth={2}
                listening={false}
              />

              {newRect.region_type === "ingredient_row" && (
                <Line
                  points={[
                    newRect.x + (newRect.split_x ?? 180),
                    newRect.y,
                    newRect.x + (newRect.split_x ?? 180),
                    newRect.y + newRect.height,
                  ]}
                  stroke="blue"
                  strokeWidth={2}
                  dash={[4, 4]}
                  listening={false}
                />
              )}
            </>
          )}
        </Layer>
      </Stage>
    </div>
  );
}