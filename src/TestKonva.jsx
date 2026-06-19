import React, { useState } from "react";
import { apiFetch } from "./apiFetch";
import { API_BASE_URL } from "./config";
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
  const [recentScans, setRecentScans] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);

  const [ocrResult, setOcrResult] = useState(null);
  const [ocrSections, setOcrSections] = useState(null);

  const [createdRecipeId, setCreatedRecipeId] = useState(null);
  const [ingredientMatches, setIngredientMatches] = useState({});
  const [itemSuggestions, setItemSuggestions] = useState({});
  const [showIngredientMatching, setShowIngredientMatching] = useState(false);
  const [measureLookup, setMeasureLookup] = useState({});
  const [categoryCandidates, setCategoryCandidates] = useState({});
  const [categorySearchText, setCategorySearchText] = useState({});

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
    console.log("LOAD REGIONS CLICKED");
    console.log("image:", image);
    console.log("recipeScanId:", recipeScanId);
    if (!image) {
      alert("Please choose an image first.");
      return;
    }
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/recipe-scans/${recipeScanId}/regions?limit=100`);
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

        const scanResponse = await apiFetch(
          `${API_BASE_URL}/api/recipe-scans/${recipeScanId}`
        );

        const scanResult = await scanResponse.json();

        if (!scanResponse.ok) {
          console.log("Load scan failed:", scanResult);
          return;
        }

        if (scanResult.parsed_json) {
          setOcrSections(scanResult.parsed_json);
          console.log("Loaded saved OCR review:", scanResult.parsed_json);
        } else {
          setOcrSections(null);
          console.log("No saved OCR review found.");
        }
      
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
          confidence: r.confidence ?? null,
        })),
      };

      const response = await apiFetch(
        `${API_BASE_URL}/api/recipe-scans/${recipeScanId}/regions/bulk`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
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
      const formData = new FormData();
      formData.append("image", file);

      const response = await apiFetch(
        `${API_BASE_URL}/api/recipe-scans/${scanId}/image`,
        {
          method: "POST",
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



  const handleRunOcr = async () => {
    if (!recipeScanId) {
      alert("Please create or load a recipe scan first.");
      return;
    }

    try {
      const response = await apiFetch(
        `${API_BASE_URL}/api/recipe-scans/${recipeScanId}/ocr`,
        {
          method: "POST",
          headers: {
             "Content-Type": "application/json",
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        console.log("OCR failed:", result);
        alert(`OCR failed: ${result.message || result.error || "Unknown error"}`);
        return;
      }

      setOcrResult(result);
      setOcrSections(result.sections || null);
      console.log("OCR ingredients", result.sections?.ingredients);
      console.log("OCR completed:", result);
    } catch (err) {
      console.error("OCR error:", err);
      alert("OCR failed.");
    }
  };

    const saveOcrReview = async () => {
      if (!recipeScanId || !ocrSections) {
        alert("No OCR review to save.");
        return;
      }

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/recipe-scans/${recipeScanId}/parsed-json`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(ocrSections),
          }
        );

        const result = await response.json();

        if (!response.ok) {
          console.log("Save OCR review failed:", result);
          alert(result.message || "Save OCR review failed.");
          return;
        }

        alert("OCR review saved.");
      } catch (err) {
        console.error("Save OCR review error:", err);
        alert("Save OCR review failed.");
      }
    };

    const loadRecentScans = async () => {
      try {
       const response = await apiFetch(`${API_BASE_URL}/api/recipe-scans?limit=20`);

        const result = await response.json();

        if (!response.ok) {
          console.log("Load recent scans failed:", result);
          alert("Load recent scans failed.");
          return;
        }

        setRecentScans(result.items || []);
      } catch (err) {
        console.error("Load recent scans error:", err);
        alert("Load recent scans failed.");
      }
    };

    const createNewScan = async () => {
      if (!selectedFile) {
        alert("Please choose an image first.");
        return;
      }

      try {
        const response = await apiFetch(`${API_BASE_URL}/api/recipe-scans`, {
          method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              house_id: localStorage.getItem("house_id_under_test"),
              source_image_name: selectedFile.name,
              image_width: image?.width || null,
              image_height: image?.height || null,
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

        const scanId = result.item?.id || result.data?.id || result.id;

        if (!scanId) {
          console.log("Could not find scan id:", result);
          alert("Recipe scan created, but scan id was not found.");
          return;
        }

        setRecipeScanId(scanId);
        console.log("Created recipe_scan_id:", scanId);

        await uploadRecipeScanImage(scanId, selectedFile);

        console.log("Uploaded resized image for scan:", scanId);
      } catch (err) {
        console.error("Create/upload recipe scan error:", err);
        alert("Failed to create/upload recipe scan.");
      }
    };

    const cleanIngredientSearchText = (text) => {
      return (text || "")
        .toLowerCase()
        .replace(/\b(raw|fresh|dried|finely|grated|extra|virgin|leaves|leaf)\b/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };

    const searchItemsForIngredient = async (index, ingredientText) => {
      const text = cleanIngredientSearchText(ingredientText);

      if (!text) {
        setItemSuggestions((prev) => ({
          ...prev,
          [index]: [],
        }));
        return;
      }

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/items?search=${encodeURIComponent(text)}&limit=10`
        );

        const result = await response.json();

        if (!response.ok) {
          console.log("Item search failed:", result);
          alert(result.message || "Item search failed.");
          return;
        }

        const items = result.items || [];

        setItemSuggestions((prev) => ({
          ...prev,
          [index]: items,
        }));

        if (items.length === 1) {
          setIngredientMatches((prev) => ({
            ...prev,
            [index]: items[0].id,
          }));
        }
      } catch (err) {
        console.error("Item search error:", err);
        alert("Item search failed.");
      }
    };

    const autoMatchIngredients = async () => {
      const ingredients = ocrSections?.ingredients || [];

      for (let i = 0; i < ingredients.length; i += 1) {
        await searchItemsForIngredient(i, ingredients[i].ingredient_text || "");
      }
    };

    const toItemDisplayName = (text) => {
      return (text || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (c) => c.toUpperCase());
    };



    const createHouseItemForIngredient = async (index, ingredientText) => {
      const name = toItemDisplayName(ingredientText);

      if (!name) {
        alert("Ingredient name is empty.");
        return;
      }

      try {
        const houseId = localStorage.getItem("house_id_under_test");

        const response = await apiFetch(`${API_BASE_URL}/api/items`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            house_id: houseId,
            base_measure_id: "MEAS_EA",
            is_food: true,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.log("Create house item failed:", result);
          alert(result.message || "Create house item failed.");
          return;
        }

        const newItem = result.item || result.data || result;

        setCategoryCandidates((prev) => ({
          ...prev,
          [index]: newItem.category_candidates || [],
        }));

        setItemSuggestions((prev) => ({
          ...prev,
          [index]: [newItem, ...(prev[index] || [])],
        }));

        setIngredientMatches((prev) => ({
          ...prev,
          [index]: newItem.id,
        }));

        alert(`Created house item: ${newItem.name}`);
      } catch (err) {
        console.error("Create house item error:", err);
        alert("Create house item failed.");
      }
    };



    const saveRecipeItemsPhase1 = async () => {
      if (!createdRecipeId) {
        alert("No recipe id found.");
        return;
      }

      const ingredients = ocrSections?.ingredients || [];

      try {
        for (let i = 0; i < ingredients.length; i += 1) {
          const selectedItemId = ingredientMatches[i];

          if (!selectedItemId) {
            continue;
          }

          const ingredient = ingredients[i];

            const lookup = await loadMeasures();

            const measureText = (ingredient.measure_text || "").toLowerCase().trim();

            const payload = {
              recipe_id: createdRecipeId,
              item_id: selectedItemId,
              quantity: parseQuantity(ingredient.amount_text),
              measure_id: lookup[measureText] || "MEAS_EA",
              sort_order: (i + 1) * 10,
              instruction: ingredient.preparation_text || "",
            };

          const response = await apiFetch(`${API_BASE_URL}/api/recipe-items`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          const result = await response.json();

          if (!response.ok) {
            console.log("Create recipe item failed:", result);
            alert(result.message || "Create recipe item failed.");
            return;
          }
        }

        alert("Recipe items saved.");
      } catch (err) {
        console.error("Save recipe items error:", err);
        alert("Save recipe items failed.");
      }
    };


    const handleConvertToRecipe = async () => {
      if (!recipeScanId) {
        alert("Please create or load a recipe scan first.");
        return;
      }

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/recipe-scans/${recipeScanId}/convert-to-recipe`,
          {
            method: "POST",
            headers: {
            },
          }
        );

        const result = await response.json();

        if (!response.ok) {
          console.log("Convert failed:", result);
          alert(result.message || "Convert failed.");
          return;
        }

        const newRecipeId = result.recipe_id || result.id || result.item?.id;

        setCreatedRecipeId(newRecipeId);
        setShowIngredientMatching(true);

        alert(`Converted to recipe: ${newRecipeId}. Now match ingredients to items.`);
      } catch (err) {
        console.error("Convert error:", err);
        alert("Convert failed.");
      }
    };

    const loadMeasures = async () => {
      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/measure?per_page=500`
        );

        const result = await response.json();

        if (!response.ok) {
          console.log("Load measures failed:", result);
          alert(result.message || "Load measures failed.");
          return {};
        }

        const preferredCountryCode = "AU";

        const chooseBetterMeasure = (current, candidate) => {
          if (!current) return candidate;

          if (
            candidate.country_code === preferredCountryCode &&
            current.country_code !== preferredCountryCode
          ) {
            return candidate;
          }

          return current;
        };

        const addAlias = (lookupObjects, alias, measure) => {
          if (!alias || !measure) return;

          const key = alias.toLowerCase();
          lookupObjects[key] = chooseBetterMeasure(
            lookupObjects[key],
            measure
          );
        };

        const lookupObjects = {};

        (result.items || []).forEach((m) => {
          addAlias(lookupObjects, m.code, m);
          addAlias(lookupObjects, m.name, m);
          addAlias(lookupObjects, m.symbol, m);
        });

        addAlias(lookupObjects, "teaspoon", lookupObjects["tsp"]);
        addAlias(lookupObjects, "teaspoons", lookupObjects["tsp"]);

        addAlias(lookupObjects, "tablespoon", lookupObjects["tbsp"]);
        addAlias(lookupObjects, "tablespoons", lookupObjects["tbsp"]);

        addAlias(lookupObjects, "cups", lookupObjects["cup"]);
        addAlias(lookupObjects, "cloves", lookupObjects["clove"]);
        addAlias(lookupObjects, "sprigs", lookupObjects["sprig"]);
        addAlias(lookupObjects, "bunches", lookupObjects["bunch"]);
        addAlias(lookupObjects, "slices", lookupObjects["slice"]);
        addAlias(lookupObjects, "cans", lookupObjects["can"]);

        const lookup = {};

        Object.entries(lookupObjects).forEach(([key, measure]) => {
          lookup[key] = measure.id;
        });

        setMeasureLookup(lookup);
        return lookup;
      } catch (err) {
        console.error("Load measures error:", err);
        alert("Load measures failed.");
        return {};
      }
    };

    const parseQuantity = (text) => {
      const value = (text || "").trim();

      if (!value) return 1;

      // simple fraction: 1/2
      if (/^\d+\/\d+$/.test(value)) {
        const [a, b] = value.split("/").map(Number);
        return b ? a / b : 1;
      }

      // mixed number: 1 1/2
      if (/^\d+\s+\d+\/\d+$/.test(value)) {
        const [whole, frac] = value.split(/\s+/);
        const [a, b] = frac.split("/").map(Number);
        return Number(whole) + (b ? a / b : 0);
      }

      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? n : 1;
    };

    const searchCategoriesForIngredient = async (index, text) => {
      const q = (text || "").trim();

      if (!q) {
        alert("Please type a category search term.");
        return;
      }

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/category?search=${encodeURIComponent(q)}&limit=10`
        );

        const result = await response.json();

        if (!response.ok) {
          console.log("Category search failed:", result);
          alert(result.message || "Category search failed.");
          return;
        }

        setCategoryCandidates((prev) => ({
          ...prev,
          [index]: result.items || [],
        }));
      } catch (err) {
        console.error("Category search error:", err);
        alert("Category search failed.");
      }
    };




    const updateItemCategory = async (itemId, categoryId) => {
      try {
        const response = await apiFetch(`${API_BASE_URL}/api/items/${itemId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            category_id: categoryId || null,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          console.log("Update item category failed:", result);
          alert(result.message || "Update item category failed.");
          return;
        }

        console.log("Updated item category:", result);
      } catch (err) {
        console.error("Update item category error:", err);
        alert("Update item category failed.");
      }
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

            setSelectedFile(resizedFile);
            setImageUrl(URL.createObjectURL(resizedFile));
            setRectangles([]);
            setRecipeScanId(null);
            setOcrSections(null);
            setOcrResult(null);

            console.log("Image loaded only. Click Create New Scan to create DB record.");
          } catch (err) {
            console.error("Image load/resize error:", err);
            alert("Failed to load image.");
          }
        }}
      />

      <div style={{ marginTop: 10, marginBottom: 10, display: "flex", gap: 8 }}>
       <button onClick={loadRecentScans}>Recent Scans</button>
       <button onClick={createNewScan}disabled={!image || !selectedFile}>Create New Scan</button>
          <input
            placeholder="Recipe Scan ID"
            value={recipeScanId || ""}
            onChange={(e) => setRecipeScanId(e.target.value)}
            style={{ width: 280 }}
          />
        <button onClick={loadRegions} disabled={!image || !recipeScanId}>Load</button>
        <button onClick={() => setCurrentLabel("title")}>Title</button>
        <button onClick={() => setCurrentLabel("notes")}>Notes</button>
        <button onClick={() => setCurrentLabel("serves")}>Serves</button>
        <button onClick={() => setCurrentLabel("ingredients")}>Ingredients</button>
        <button onClick={() => setCurrentLabel("instructions")}>Instructions</button>
        <button onClick={() => setCurrentLabel("instruction_column")}>Instruction Column</button>
        <button onClick={handleUndo}>Undo</button>
        <button onClick={handleSave} disabled={!recipeScanId}>Save</button>
        <button onClick={handleRunOcr} disabled={!recipeScanId}>Run OCR</button>
        <button onClick={() => setRectangles([])}>Clear</button>
      </div>

        {recentScans.length > 0 && (
          <div
            style={{
              marginTop: 12,
              marginBottom: 12,
              padding: 12,
              border: "1px solid #ccc",
              borderRadius: 8,
              background: "#fafafa",
            }}
          >
            <h3>Recent Scans</h3>

            {recentScans.map((scan) => {
              const imageName =
                scan.source_image_name === `${scan.id}.jpg`
                  ? null
                  : scan.source_image_name;

              return (
                <button
                  key={scan.id}
                  type="button"
                  onClick={() => {
                    setRecipeScanId(scan.id);
                    console.log("Selected existing scan:", scan.id);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: 10,
                    marginBottom: 8,
                    border: "1px solid #ccc",
                    borderRadius: 8,
                    background: "white",
                    cursor: "pointer",
                  }}
                >
                  {imageName && (
                    <div>
                      <b>{imageName}</b>
                    </div>
                  )}

                  <div style={{ fontSize: 12 }}>
                    <b>{scan.status}</b>
                    {" | "}
                    {new Date(
                      scan.updated_at || scan.created_at
                    ).toLocaleString("en-AU", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>

                  <div style={{ fontSize: 12, color: "#666" }}>
                    {scan.id}
                  </div>
                </button>
              );
            })}
          </div>
        )}

      {ocrSections && (
        <div
          style={{
            marginTop: 20,
            marginBottom: 20,
            padding: 16,
            border: "1px solid #ccc",
            borderRadius: 8,
            background: "#fafafa",
          }}
        >
            <h2>OCR Review</h2>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <button
                onClick={saveOcrReview}
                disabled={!recipeScanId || !ocrSections}
              >
                Save OCR Review
              </button>

              <button
                onClick={handleConvertToRecipe}
                disabled={!recipeScanId || !ocrSections}
              >
                Convert to Recipe
              </button>
            </div>

          <div style={{ marginBottom: 12 }}>
            <label>
              <b>Title</b>
            </label>
            <input
              value={ocrSections.title || ""}
              onChange={(e) =>
                setOcrSections({
                  ...ocrSections,
                  title: e.target.value,
                })
              }
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>
              <b>Serves</b>
            </label>
            <input
              value={ocrSections.serves || ""}
              onChange={(e) =>
                setOcrSections({
                  ...ocrSections,
                  serves: e.target.value,
                })
              }
              style={{ display: "block", width: 120, marginTop: 4 }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>
              <b>Notes</b>
            </label>
            <textarea
              value={ocrSections.notes || ""}
              onChange={(e) =>
                setOcrSections({
                  ...ocrSections,
                  notes: e.target.value,
                })
              }
              rows={4}
              style={{ display: "block", width: "100%", marginTop: 4 }}
            />
          </div>

          <h3>Ingredients</h3>

            <button
              type="button"
              onClick={() => {
                const ingredients = [...(ocrSections.ingredients || [])];

                ingredients.push({
                  raw_text: "",
                  amount_text: "",
                  measure_text: "",
                  alt_amount_text: "",
                  alt_measure_text: "",
                  ingredient_text: "",
                  preparation_text: "",
                });

                setOcrSections({ ...ocrSections, ingredients });
              }}
              style={{
                  marginBottom: 8,
                  display: "block",
                  alignSelf: "flex-start",
                }}
            >
              Add Ingredient Row
            </button>

          <div style={{
                    display: "grid",
                    gridTemplateColumns: "45px 45px 45px 45px minmax(0, 1fr)",
                    width: "100%",
                    alignItems: "center",
                    gap: 8,
                    fontWeight: "bold",
                    marginBottom: 6,
               }}
             >
            <div>Amt</div>
            <div>Unit</div>
            <div>Alt Amt</div>
            <div>Alt Unit</div>
            <div>Ingredient/Preparation</div>
          </div>

          {(ocrSections.ingredients || []).map((item, index) => (
            <div
              key={index}
              style={{
                display: "grid",
                gridTemplateColumns: "45px 45px 45px 45px minmax(0, 1fr)",
                width: "100%",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <input
                value={item.amount_text || ""}
                onChange={(e) => {
                  const ingredients = [...(ocrSections.ingredients || [])];
                  ingredients[index] = {
                    ...ingredients[index],
                    amount_text: e.target.value,
                  };
                  setOcrSections({ ...ocrSections, ingredients });
                }}
              />

              <input
                value={item.measure_text || ""}
                onChange={(e) => {
                  const ingredients = [...(ocrSections.ingredients || [])];
                  ingredients[index] = {
                    ...ingredients[index],
                    measure_text: e.target.value,
                  };
                  setOcrSections({ ...ocrSections, ingredients });
                }}
              />

              <input
                value={item.alt_amount_text || ""}
                onChange={(e) => {
                  const ingredients = [...(ocrSections.ingredients || [])];
                  ingredients[index] = {
                    ...ingredients[index],
                    alt_amount_text: e.target.value,
                  };
                  setOcrSections({ ...ocrSections, ingredients });
                }}
              />

              <input
                value={item.alt_measure_text || ""}
                onChange={(e) => {
                  const ingredients = [...(ocrSections.ingredients || [])];
                  ingredients[index] = {
                    ...ingredients[index],
                    alt_measure_text: e.target.value,
                  };
                  setOcrSections({ ...ocrSections, ingredients });
                }}
              />

                <div
                  style={{
                    minWidth: 0,
                  }}                
                >
                  <input
                    value={item.ingredient_text || ""}
                    onChange={(e) => {
                      const ingredients = [...(ocrSections.ingredients || [])];
                      ingredients[index] = {
                        ...ingredients[index],
                        ingredient_text: e.target.value,
                      };
                      setOcrSections({ ...ocrSections, ingredients });
                    }}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                
                  <input
                    placeholder="↳ preparation"
                    value={item.preparation_text || ""}
                    onChange={(e) => {
                      const ingredients = [...(ocrSections.ingredients || [])];
                      ingredients[index] = {
                        ...ingredients[index],
                        preparation_text: e.target.value,
                      };
                      setOcrSections({ ...ocrSections, ingredients });
                    }}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      marginTop: 4,
                      fontSize: "0.9em",
                    }}
                  />
                </div>


            </div>
          ))}

          <h3>Instructions</h3>

          {(ocrSections.instruction_steps || []).map((step, index) => (
            <div key={index} style={{ marginBottom: 12 }}>
              <label>
                <b>Step {index + 1}</b>
              </label>
              <textarea
                value={step || ""}
                onChange={(e) => {
                  const instruction_steps = [
                    ...(ocrSections.instruction_steps || []),
                  ];
                  instruction_steps[index] = e.target.value;
                  setOcrSections({ ...ocrSections, instruction_steps });
                }}
                rows={4}
                style={{ display: "block", width: "100%", marginTop: 4 }}
              />
            </div>
          ))}
        </div>
      )}


        {showIngredientMatching && (
          <div
            style={{
              marginTop: 20,
              marginBottom: 20,
              padding: 16,
              border: "1px solid #ccc",
              borderRadius: 8,
              background: "#f7f7f7",
              textAlign: "left",
            }}
          >
            <h2>Ingredient Item Matching</h2>

            <div style={{ marginBottom: 12 }}>
              <b>Recipe ID:</b> {createdRecipeId || "(not found)"}
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <button onClick={autoMatchIngredients}>
                Match Ingredients
              </button>

              <button onClick={saveRecipeItemsPhase1}>
                Save Recipe Items
              </button>

              <button onClick={() => alert("Category Manager coming soon")}>
                Manage Categories
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "140px 1fr",
                gap: 8,
                fontWeight: "bold",
                marginBottom: 6,
                justifyContent: "start",
                width: "100%",
              }}
            >
            <div>Ingredient</div>
            <div>Matched Item / Actions</div>
            </div>

            {(ocrSections?.ingredients || []).map((ingredient, index) => {
              const suggestions = itemSuggestions[index] || [];

              return (
                <div
                  key={index}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "140px 1fr",
                    gap: 8,
                    marginBottom: 8,
                    alignItems: "start",
                    justifyContent: "start",
                    width: "100%",
                  }}
                >

                  <div>{ingredient.ingredient_text || ""}</div>

                    <div>
                      {suggestions.length > 0 ? (
                        <>
                          <select
                            value={ingredientMatches[index] || ""}
                            onChange={(e) =>
                              setIngredientMatches((prev) => ({
                                ...prev,
                                [index]: e.target.value,
                              }))
                            }
                            style={{ width: 150}}
                          >
                            <option value="">Select item</option>

                            {suggestions.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name || item.slug || item.id}
                              </option>
                            ))}
                          </select>

                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            createHouseItemForIngredient(
                              index,
                              ingredient.ingredient_text || ""
                            )
                          }
                        >
                          Create New Item
                        </button>
                      )}
                    </div>
                </div>
              );
            })}

          </div>
        )}


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