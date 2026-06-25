import React, { useState, useEffect } from "react";
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
// ============================================================
// SECTION: Main image, drawing, and scan state
// ============================================================
  const [imageUrl, setImageUrl] = useState(null);
  const [image] = useImage(imageUrl);
  const [rectangles, setRectangles] = useState([]);
  const [newRect, setNewRect] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentLabel, setCurrentLabel] = useState("title");
  const [recipeScanId, setRecipeScanId] = useState(null);
  const [recentScans, setRecentScans] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);


  
  const [houses, setHouses] = useState([]);
  const [selectedHouseId, setSelectedHouseId] = useState("");


// ============================================================
// SECTION: OCR review and recipe conversion state
// ============================================================
  const [ocrResult, setOcrResult] = useState(null);
  const [ocrSections, setOcrSections] = useState(null);

// ============================================================
// SECTION: Ingredient matching state
// ============================================================
  const [createdRecipeId, setCreatedRecipeId] = useState(null);
  const [ingredientMatches, setIngredientMatches] = useState({});
  const [itemSuggestions, setItemSuggestions] = useState({});
  const [showIngredientMatching, setShowIngredientMatching] = useState(false);
  const [measureLookup, setMeasureLookup] = useState({});
  const [categoryCandidates, setCategoryCandidates] = useState({});
  const [categorySearchText, setCategorySearchText] = useState({});
  const [dietaries, setDietaries] = useState([]);
  const [selectedDietaryIds, setSelectedDietaryIds] = useState([]);

    useEffect(() => {
      async function loadHouses() {
        try {
          const response = await apiFetch(`${API_BASE_URL}/api/houses`);
          const result = await response.json();

          if (!response.ok) {
            console.log("Load houses failed:", result);
            return;
          }

          setHouses(Array.isArray(result) ? result : result.items || []);

          const houseList = Array.isArray(result) ? result : result.items || [];
          if (houseList.length === 1) {
            setSelectedHouseId(houseList[0].id);
          }
        } catch (err) {
          console.error("Load houses error:", err);
        }
      }

      loadHouses();
    }, []);

    // ============================================================
    // SECTION: Load dietaries
    // ============================================================
    useEffect(() => {
      async function loadDietaries() {
        try {
          const response = await apiFetch(
            `${API_BASE_URL}/api/dietaries?limit=100`
          );

          const result = await response.json();

          if (!response.ok) {
            console.log("Load dietaries failed:", result);
            return;
          }

          setDietaries(result.items || []);
        } catch (err) {
          console.error("Load dietaries error:", err);
        }
      }

      loadDietaries();
    }, []);

// ============================================================
// SECTION: Image display scaling
// ============================================================
  const maxViewportWidth = Math.min(window.innerWidth - 40, 900);
  const scale = image ? Math.min(1, maxViewportWidth / image.width) : 1;
  const stageWidth = image ? image.width * scale : 1200;
  const stageHeight = image ? image.height * scale : 1800;

// ============================================================
// SECTION: Image coordinate helpers
// ============================================================
  const toImagePos = (stage) => {
    const p = stage.getPointerPosition();
    return {
      x: p.x / scale,
      y: p.y / scale,
    };
  };

// ============================================================
// SECTION: Image resize before upload
// ============================================================
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

// ============================================================
// SECTION: Load saved scan regions and OCR review
// ============================================================
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

        setCreatedRecipeId(scanResult.recipe_id || null);
        setShowIngredientMatching(Boolean(scanResult.recipe_id));

        setIngredientMatches({});
        setItemSuggestions({});

        if (scanResult.recipe_id) {
          await restoreRecipeItemMatches(scanResult.recipe_id);
        }
      
    } catch (err) {
      console.error("Load regions error:", err);
    }
  };

// ============================================================
// SECTION: Rectangle drawing handlers
// ============================================================
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

// ============================================================
// SECTION: Rectangle edit helpers
// ============================================================
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

// ============================================================
// SECTION: Save region rectangles
// ============================================================
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

// ============================================================
// SECTION: Create scan and upload image
// ============================================================
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


// ============================================================
// SECTION: OCR execution and OCR review save
// ============================================================
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
            body: JSON.stringify({
              ...ocrSections,
              dietary_ids: selectedDietaryIds,
            }),
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

        if (!selectedHouseId) {
          alert("Please select a house first.");
          return;
        }

        try {
          const response = await apiFetch(`${API_BASE_URL}/api/recipe-scans`, {
          method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              house_id: selectedHouseId,
              created_by: localStorage.getItem("account_id"),
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

// ============================================================
// SECTION: Ingredient search and auto-match helpers
// ============================================================
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

          await searchCategoriesForIngredient(index, ingredientText);
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

// ============================================================
// SECTION: Create house item from unmatched ingredient
// ============================================================
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
        const houseId = selectedHouseId;
        console.log("CREATE HOUSE ITEM houseId:", houseId);
        if (!houseId) {
          alert("No active house selected. Please select a house first.");
          return;
        }
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

        console.log("NEW ITEM", newItem);
        console.log("CATEGORY CANDIDATES", newItem.category_candidates);

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

        await searchCategoriesForIngredient(index, ingredientText);

        alert(`Created house item: ${newItem.name}`);
      } catch (err) {
        console.error("Create house item error:", err);
        alert("Create house item failed.");
      }
    };


// ============================================================
// SECTION: Save matched ingredients as recipe items
// ============================================================
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

// ============================================================
// SECTION: Convert OCR review to recipe
// ============================================================
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

// ============================================================
// SECTION: Measures and quantity parsing
// ============================================================
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

// ============================================================
// SECTION: Category search and item category update
// ============================================================
    const searchCategoriesForIngredient = async (index, text) => {
      const q = (text || "").trim();
      console.log("CATEGORY SEARCH:", index, text);

      if (!q) {
        alert("Please type a category search term.");
        return;
      }

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/category?search=${encodeURIComponent(q)}&limit=10`
        );

        const result = await response.json();
        console.log("CATEGORY RESULT:", result);

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


{/* ============================================================
    UI: Recipe Item Matches
   ============================================================ */}

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



    const restoreRecipeItemMatches = async (recipeId) => {
      if (!recipeId) return;

      try {
        const response = await apiFetch(
          `${API_BASE_URL}/api/recipe-items?recipe_id=${encodeURIComponent(recipeId)}&limit=200`
        );

        const result = await response.json();

//         console.log("RESTORE MATCHES recipeId:", recipeId);
//         console.log("RESTORE MATCHES result:", result);

        if (!response.ok) {
          console.log("Restore recipe item matches failed:", result);
          return;
        }

        const restoredMatches = {};
        const restoredSuggestions = {};

        for (const recipeItem of result.items || []) {
          const index = Math.floor((recipeItem.sort_order || 10) / 10) - 1;

          if (index < 0 || !recipeItem.item_id) continue;

          restoredMatches[index] = recipeItem.item_id;

          const itemResponse = await apiFetch(
            `${API_BASE_URL}/api/items/${recipeItem.item_id}`
          );

          const itemResult = await itemResponse.json();

//           console.log("RESTORE MATCHES itemResult:", itemResult);

          if (itemResponse.ok) {
            restoredSuggestions[index] = [
              itemResult.item || itemResult.data || itemResult,
            ];
          }
        }

//         console.log("RESTORE MATCHES restoredMatches:", restoredMatches);
//         console.log("RESTORE MATCHES restoredSuggestions:", restoredSuggestions);

        setIngredientMatches(restoredMatches);
        setItemSuggestions(restoredSuggestions);
      } catch (err) {
        console.error("Restore recipe item matches error:", err);
      }
    };


// ============================================================
// SECTION: Render UI
// ============================================================
  return (
    <div style={{ padding: 20 }}>
      <h2>Recipe Scan Region Editor</h2>

        <div style={{ marginTop: 10, marginBottom: 10 }}>
          <label>
            <b>House</b>
          </label>

          <select
            value={selectedHouseId}
            onChange={(e) => setSelectedHouseId(e.target.value)}
            style={{ marginLeft: 8, width: 260 }}
          >
            <option value="">Select house...</option>

            {houses.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name} ({h.my_role})
              </option>
            ))}
          </select>
        </div>

{/* ============================================================
    UI: Image file picker
   ============================================================ */}
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

{/* ============================================================
    UI: Recent scans panel
   ============================================================ */}
      <div style={{ marginTop: 10, marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <button onClick={loadRecentScans}>Recent Scans</button>

              <button
                onClick={createNewScan}
                disabled={!image || !selectedFile}
              >
                Create New Scan
              </button>

              <input
                placeholder="Recipe Scan ID"
                value={recipeScanId || ""}
                onChange={(e) => setRecipeScanId(e.target.value)}
                style={{ width: 280 }}
              />

              <button
                onClick={loadRegions}
                disabled={!image || !recipeScanId}
              >
                Load
              </button>
            </div>

            {/* Row 2 */}
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <button onClick={() => setCurrentLabel("title")}>Title</button>
              <button onClick={() => setCurrentLabel("serves")}>Serves</button>
              <button onClick={() => setCurrentLabel("ingredients")}>Ingr</button>
              <button onClick={() => setCurrentLabel("instructions")}>Steps</button>
              <button onClick={() => setCurrentLabel("instruction_column")}>Step Col</button>
              <button onClick={() => setCurrentLabel("notes")}>Notes</button>
            </div>

            {/* Row 3 */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={handleUndo}>Undo</button>
              <button onClick={handleSave} disabled={!recipeScanId}>Save</button>
              <button onClick={handleRunOcr} disabled={!recipeScanId}>Run OCR</button>
              <button onClick={() => setRectangles([])}>Clear</button>
            </div>

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

                    onClick={async () => {
                      console.log("Selected scan:", scan);
                      console.log("source_image_url:", scan.source_image_url);

                      setRecipeScanId(scan.id);

                      if (scan.source_image_url) {
                        const fullImageUrl = `${API_BASE_URL}${scan.source_image_url}`;
                        console.log("fullImageUrl:", fullImageUrl);
                        setImageUrl(fullImageUrl);
                      }

                      setSelectedFile(null);
                      setRecentScans([]);

                      try {
                        const regionsResponse = await apiFetch(
                          `${API_BASE_URL}/api/recipe-scans/${scan.id}/regions?limit=100`
                        );

                        const regionsResult = await regionsResponse.json();

                        if (!regionsResponse.ok) {
                          console.log("Load regions failed:", regionsResult);
                          alert(regionsResult.message || "Load regions failed.");
                          return;
                        }

                        const loadedRects = (regionsResult.items || [])
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
                          `${API_BASE_URL}/api/recipe-scans/${scan.id}`
                        );

                        const scanResult = await scanResponse.json();

                        if (!scanResponse.ok) {
                          console.log("Load scan failed:", scanResult);
                          alert(scanResult.message || "Load scan failed.");
                          return;
                        }

                        if (scanResult.parsed_json) {
                          setOcrSections(scanResult.parsed_json);
                          setSelectedDietaryIds(scanResult.parsed_json.dietary_ids || []);
                        } else {
                          setOcrSections(null);
                          setSelectedDietaryIds([]);
                        }

                        setCreatedRecipeId(scanResult.recipe_id || null);
                        setShowIngredientMatching(Boolean(scanResult.recipe_id));

                        setIngredientMatches({});
                        setItemSuggestions({});

                        if (scanResult.recipe_id) {
                          await restoreRecipeItemMatches(scanResult.recipe_id);
                        }
                        
                        setOcrResult(null);

                        console.log("Selected existing scan and loaded regions:", scan.id);
                      } catch (err) {
                        console.error("Load selected scan error:", err);
                        alert("Load selected scan failed.");
                      }
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

{/* ============================================================
    UI: OCR review editor
   ============================================================ */}
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

{/* SECTION: Recipe metadata (serves and dietary) */}
            <div
              style={{
                display: "flex",
                gap: 16,
                alignItems: "flex-start",
                marginBottom: 12,
              }}
            >

{/* The Serves part */}
              <div>
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
                  style={{
                    display: "block",
                    width: 120,
                    marginTop: 4,
                  }}
                />
              </div>

{/* The Dietary part */}
                <div>
                  <label>
                    <b>Dietary</b>
                  </label>

                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const dietaryId = e.target.value;

                      if (!dietaryId) return;

                      setSelectedDietaryIds((prev) =>
                        prev.includes(dietaryId)
                          ? prev
                          : [...prev, dietaryId]
                      );

                      e.target.value = "";
                    }}
                    style={{
                      display: "block",
                      width: 220,
                      marginTop: 4,
                    }}
                  >
                    <option value="">Add dietary...</option>

                    {dietaries.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>

                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 6,
                      maxWidth: 300,
                    }}
                  >
                    {selectedDietaryIds.map((dietaryId) => {
                      const dietary = dietaries.find(
                        (d) => d.id === dietaryId
                      );

                      return (
                        <button
                          key={dietaryId}
                          type="button"
                          onClick={() =>
                            setSelectedDietaryIds((prev) =>
                              prev.filter((x) => x !== dietaryId)
                            )
                          }
                        >
                          {dietary?.name || dietaryId} ×
                        </button>
                      );
                    })}
                  </div>
                </div>

            </div>
{/* */}

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

            <button
              type="button"
              onClick={() => {
                const instruction_steps = [
                  ...(ocrSections.instruction_steps || []),
                  "",
                ];

                setOcrSections({
                  ...ocrSections,
                  instruction_steps,
                });
              }}
              style={{ marginBottom: 8 }}
            >
              Add Step
            </button>

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

{/* ============================================================
    UI: Ingredient item matching
   ============================================================ */}
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
                      {/* Item selection and item creation */}
                      {suggestions.length > 0 && (
                        <select
                          value={ingredientMatches[index] || ""}
                          onChange={(e) => {
                            const itemId = e.target.value;

                            setIngredientMatches((prev) => ({
                              ...prev,
                              [index]: itemId,
                            }));

                            if (itemId) {
                              searchCategoriesForIngredient(
                                index,
                                cleanIngredientSearchText(ingredient.ingredient_text || "")
                              );
                            }
                          }}
                          style={{ width: 150, marginRight: 8 }}
                        >
                          <option value="">Select item</option>

                          {suggestions.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name || item.slug || item.id}
                            </option>
                          ))}
                        </select>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          createHouseItemForIngredient(index, ingredient.ingredient_text || "")
                        }
                      >
                        Create New Item
                      </button>

                    {/* Whole category section */}
                    {ingredientMatches[index] && (
                      <div
                        style={{
                          marginTop: 8,
                          display: "flex",
                          gap: 4,
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const categoryId = e.target.value;

                            if (!categoryId) return;

                            updateItemCategory(
                              ingredientMatches[index],
                              categoryId
                            );
                          }}
                          style={{ width: 150 }}
                        >
                          <option value="">Select category</option>

                          {(categoryCandidates[index] || []).map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>

                        <input
                          type="text"
                          placeholder="category"
                          value={categorySearchText[index] || ""}
                          onChange={(e) =>
                            setCategorySearchText((prev) => ({
                              ...prev,
                              [index]: e.target.value,
                            }))
                          }
                          style={{ width: 87.5 }}
                        />

                        <button
                          type="button"
                          onClick={() =>
                            searchCategoriesForIngredient(
                              index,
                              categorySearchText[index] || ""
                            )
                          }
                        >
                          Search
                        </button>
                      </div>
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

{/* ============================================================
    UI: Konva image canvas and region rectangles
   ============================================================ */}
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