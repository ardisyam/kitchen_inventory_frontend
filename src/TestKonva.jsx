import React, { useState } from "react";
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

  const [recipeScanId, setRecipeScanId] = useState(null);

  const maxViewportWidth = Math.min(window.innerWidth - 40, 900);

  const scale = image ? Math.min(1, maxViewportWidth / image.width) : 1;

  const stageWidth = image ? image.width * scale : 1200;
  const stageHeight = image ? image.height * scale : 1800;

  const toImagePos = (stage) => {
    const p = stage.getPointerPosition();
    return {
      x: p.x / scale,
      y: p.y / scale,
    };
  };

    const resizeImageFile = (file, maxWidth = 1200, quality = 0.75) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);

          const canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);

          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(objectUrl);

              if (!blob) {
                reject(new Error("Image resize failed"));
                return;
              }

              const resizedFile = new File(
                [blob],
                file.name.replace(/\.[^.]+$/, ".jpg"),
                { type: "image/jpeg" }
              );

              resolve(resizedFile);
            },
            "image/jpeg",
            quality
          );
        };

        img.onerror = reject;
        img.src = objectUrl;
      });
    };

  const loadRegions = async () => {
    if (!image) {
      alert("Please choose an image first.");
      return;
    }
    try {
      const token = localStorage.getItem("access_token_admin");
      const actorId = localStorage.getItem("admin_user_id");

      const response = await fetch(
        `http://localhost:5000/api/recipe-scans/${recipeScanId}/regions?limit=100`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Actor-Id": actorId,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.log("Load failed:", result);
        return;
      }

      const loadedRects = (result.items || [])
        .map((r) => {
          const regionType =
            r.label === "serves" && r.region_type === "notes"
              ? "serves"
              : r.region_type || "unknown";

          const x = Number(r.x);
          const y = Number(r.y);
          const width = Number(r.width);
          const height = Number(r.height);

          if ([x, y, width, height].some(Number.isNaN)) return null;

          return {
            id: r.id,
            x: width < 0 ? x + width : x,
            y: height < 0 ? y + height : y,
            width: Math.abs(width),
            height: Math.abs(height),
            split_x: r.split_x == null ? null : Number(r.split_x),
            region_type: regionType,
            label: r.label || regionType,
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

    const pos = toImagePos(e.target.getStage());

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

    const pos = toImagePos(e.target.getStage());

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
      x: newRect.width < 0 ? newRect.x + newRect.width : newRect.x,
      y: newRect.height < 0 ? newRect.y + newRect.height : newRect.y,
      width: Math.abs(newRect.width),
      height: Math.abs(newRect.height),
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
      updated[index] = { ...updated[index], x, y };
      return updated;
    });
  };

  const updateSplitX = (index, absoluteX) => {
    setRectangles((prev) => {
      const updated = [...prev];
      const rect = updated[index];

      let splitX = absoluteX - rect.x;
      splitX = Math.max(10, Math.min(splitX, rect.width - 10));

      updated[index] = {
        ...rect,
        split_x: splitX,
      };

      return updated;
    });
  };

  const handleSave = async () => {
    try {
      const payload = {
        regions: rectangles.map((r, index) => ({
          region_type:
            r.region_type === "serves"
              ? "notes"
              : r.region_type || r.label || "unknown",

          label:
            r.region_type === "serves"
              ? "serves"
              : r.label || r.region_type || `Region ${index + 1}`,

          sort_order: index + 1,

          x: Math.round(Math.max(0, r.x)),
          y: Math.round(Math.max(0, r.y)),
          width: Math.round(Math.max(10, r.width)),
          height: Math.round(Math.max(10, r.height)),

          split_x:
            r.region_type === "ingredient_row"
              ? Math.round(r.split_x ?? 180)
              : null,

          ocr_text: r.ocr_text || "",
          parsed_json: r.parsed_json || null,
          confidence: r.confidence || null,
        })),
      };

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

      const result = await response.json();

      if (!response.ok) {
        alert(`Save failed: ${result.message || result.error}`);
        return;
      }

      alert("Save successful!");
    } catch (err) {
      console.error("Save error:", err);
      alert("Save failed.");
    }
  };

    const uploadRecipeScanImage = async (scanId, file) => {
      const token = localStorage.getItem("access_token_admin");
      const actorId = localStorage.getItem("admin_user_id");

      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch(
        `http://localhost:5000/api/recipe-scans/${scanId}/image`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Actor-Id": actorId,
          },
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.log("Image upload failed:", result);
        throw new Error(result.message || "Image upload failed");
      }

      return result;
    };

  return (
    <div style={{ padding: 20 }}>
      <h2>Recipe Scan Region Editor</h2>

      <input
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          try {
            const resizedFile = await resizeImageFile(file);

            console.log("Original:", file.name, Math.round(file.size / 1024), "KB");
            console.log("Resized:", resizedFile.name, Math.round(resizedFile.size / 1024), "KB");
        
            setImageUrl(URL.createObjectURL(resizedFile));
            setRectangles([]);
            setRecipeScanId(null);

            const token = localStorage.getItem("access_token_admin");
            const actorId = localStorage.getItem("admin_user_id");

            const response = await fetch("http://localhost:5000/api/recipe-scans", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-Actor-Id": actorId,
              },
              body: JSON.stringify({
                source_image_name: resizedFile.name,
                image_width: null,
                image_height: null,
                status: "draft",
                notes: "Created from region editor",
              }),
            });

            const result = await response.json();

            if (!response.ok) {
              console.log("Create recipe scan failed:", result);
              alert("Failed to create recipe scan.");
              return;
            }

            const scanId = result.item?.id || result.id;

            setRecipeScanId(scanId);
            console.log("Created recipe_scan_id:", scanId);

            await uploadRecipeScanImage(scanId, resizedFile);

            console.log("Uploaded resized image for scan:", scanId);
          } catch (err) {
            console.error("Create/upload recipe scan error:", err);
            alert("Failed to create/upload recipe scan.");
          }
        }}
      />

      <div style={{ marginTop: 10, marginBottom: 10, display: "flex", gap: 8 }}>
        <button onClick={loadRegions} disabled={!image || !recipeScanId}>Load</button>
        <button onClick={() => setCurrentLabel("title")}>Title</button>
        <button onClick={() => setCurrentLabel("notes")}>Notes</button>
        <button onClick={() => setCurrentLabel("serves")}>Serves</button>
{/*         <button onClick={() => setCurrentLabel("ingredient_row")}>Ingredient Row</button> */}
        <button onClick={() => setCurrentLabel("ingredients")}>Ingredients</button>
        <button onClick={() => setCurrentLabel("instructions")}>Instructions</button>
        <button onClick={handleUndo}>Undo</button>
        <button onClick={handleSave} disabled={!recipeScanId}>Save</button>
        <button onClick={() => setRectangles([])}>Clear</button>
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
        style={{ border: "1px solid #999", background: "#eee" }}
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
                  x={rect.x * scale}
                  y={(rect.y - 18) * scale}
                  text={rect.label}
                  fill="red"
                  fontSize={14}
                  listening={false}
                />

                {rect.region_type === "ingredient_row" && (
                  <>
                    <Line
                      points={[
                        splitAbsX,
                        rect.y * scale,
                        splitAbsX,
                        (rect.y + rect.height) * scale,
                      ]}
                      stroke="red"
                      strokeWidth={2}
                      dash={[4, 4]}
                      listening={false}
                    />

                    <Rect
                      x={splitAbsX - 5}
                      y={rect.y * scale}
                      width={10}
                      height={rect.height * scale}
                      fill="rgba(255,0,0,0.15)"
                      stroke="red"
                      strokeWidth={1}
                      draggable
                      dragBoundFunc={(pos) => ({
                        x: Math.max(
                          (rect.x + 10) * scale - 5,
                          Math.min(
                            pos.x,
                            (rect.x + rect.width - 10) * scale - 5
                          )
                        ),
                        y: rect.y * scale,
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
                x={newRect.x * scale}
                y={newRect.y * scale}
                width={newRect.width * scale}
                height={newRect.height * scale}
                stroke="blue"
                dash={[5, 5]}
                strokeWidth={2}
                listening={false}
              />

              {newRect.region_type === "ingredient_row" && (
                <Line
                  points={[
                    (newRect.x + (newRect.split_x ?? 180)) * scale,
                    newRect.y * scale,
                    (newRect.x + (newRect.split_x ?? 180)) * scale,
                    (newRect.y + newRect.height) * scale,
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