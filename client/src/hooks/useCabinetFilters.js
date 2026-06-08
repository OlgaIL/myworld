import { useMemo, useState } from "react";

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function getPhotoSearchText(photo) {
  return [
    photo?.title,
    photo?.summary,
    photo?.category,
    Array.isArray(photo?.tags) ? photo.tags.join(" ") : "",
    photo?.cleanText,
    photo?.text
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getCategoryOptions(photos) {
  return Array.from(
    new Set(
      photos
        .map((photo) => String(photo?.category || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ru"));
}

function getTagOptions(photos) {
  return Array.from(
    new Set(
      photos
        .flatMap((photo) => (Array.isArray(photo?.tags) ? photo.tags : []))
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, "ru"));
}

export function useCabinetFilters(photos) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [showTags, setShowTags] = useState(false);

  const categoryOptions = useMemo(() => getCategoryOptions(photos), [photos]);
  const tagOptions = useMemo(() => getTagOptions(photos), [photos]);
  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const filteredPhotos = useMemo(() => {
    return photos.filter((photo) => {
      if (activeCategory && photo.category !== activeCategory) {
        return false;
      }

      if (activeTag && !photo.tags?.includes(activeTag)) {
        return false;
      }

      if (!normalizedSearchQuery) {
        return true;
      }

      return getPhotoSearchText(photo).includes(normalizedSearchQuery);
    });
  }, [photos, activeCategory, activeTag, normalizedSearchQuery]);

  function resetCategory() {
    setActiveCategory("");
  }

  function selectCategory(category) {
    setSearchQuery("");
    setActiveCategory(category);
  }

  function resetTag() {
    setActiveTag("");
  }

  function selectTag(tag) {
    setSearchQuery("");
    setActiveTag(tag);
    setShowTags(true);
  }

  function toggleTags() {
    setShowTags((current) => {
      if (current) {
        setActiveTag("");
      }

      return !current;
    });
  }

  return {
    searchQuery,
    setSearchQuery,
    activeCategory,
    activeTag,
    showTags,
    categoryOptions,
    tagOptions,
    filteredPhotos,
    resetCategory,
    selectCategory,
    resetTag,
    selectTag,
    toggleTags
  };
}
