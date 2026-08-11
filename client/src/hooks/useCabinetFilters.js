import { useMemo, useState } from "react";

const UNCATEGORIZED_SECTION = "Без раздела";
const UNCATEGORIZED_TOPIC = "Без темы";

function normalizeSearchValue(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeValue(value, fallback = "") {
  return String(value || "").trim() || fallback;
}

function getPhotoSearchText(photo) {
  return [
    photo?.title,
    photo?.summary,
    photo?.category,
    photo?.section,
    photo?.topic,
    Array.isArray(photo?.tags) ? photo.tags.join(" ") : "",
    photo?.cleanText,
    photo?.text
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function getCountOptions(values) {
  const counts = new Map();

  values.forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  return Array.from(counts, ([value, count]) => ({ value, count }))
    .sort((left, right) => right.count - left.count || left.value.localeCompare(right.value, "ru"));
}

function getPhotoDate(photo) {
  const date = photo?.createdAt ? new Date(photo.createdAt) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function getDateParts(photo) {
  const date = getPhotoDate(photo);

  if (!date) {
    return null;
  }

  const year = String(date.getFullYear());
  const month = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  const day = `${month}-${String(date.getDate()).padStart(2, "0")}`;

  return { year, month, day, date };
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function formatMonth(value) {
  const [year, month] = value.split("-").map(Number);
  return capitalize(new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(new Date(year, month - 1, 1)));
}

function formatDay(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" }).format(new Date(year, month - 1, day));
}

export function useCabinetFilters(photos) {
  const [searchQuery, setSearchQuery] = useState("");
  const [browseMode, setBrowseMode] = useState("topics");
  const [activeCategory, setActiveCategory] = useState("");
  const [activeSection, setActiveSection] = useState("");
  const [activeTopic, setActiveTopic] = useState("");
  const [activeTag, setActiveTag] = useState("");
  const [activeYear, setActiveYear] = useState("");
  const [activeMonth, setActiveMonth] = useState("");
  const [activeDay, setActiveDay] = useState("");
  const [showTags, setShowTags] = useState(false);

  const sectionOptions = useMemo(
    () => getCountOptions(photos.map((photo) => normalizeValue(photo?.section, UNCATEGORIZED_SECTION))),
    [photos]
  );

  const topicOptions = useMemo(() => {
    if (!activeSection) {
      return [];
    }

    return getCountOptions(
      photos
        .filter((photo) => normalizeValue(photo?.section, UNCATEGORIZED_SECTION) === activeSection)
        .map((photo) => normalizeValue(photo?.topic, UNCATEGORIZED_TOPIC))
    );
  }, [photos, activeSection]);

  const tagOptions = useMemo(() => {
    if (!activeSection && !activeTopic && !activeTag) {
      return [];
    }

    const matchingPhotos = photos.filter((photo) => {
      if (activeSection && normalizeValue(photo?.section, UNCATEGORIZED_SECTION) !== activeSection) {
        return false;
      }

      return !activeTopic || normalizeValue(photo?.topic, UNCATEGORIZED_TOPIC) === activeTopic;
    });

    return getCountOptions(
      matchingPhotos.flatMap((photo) => (
        Array.isArray(photo?.tags)
          ? photo.tags.map((tag) => normalizeValue(tag)).filter(Boolean)
          : []
      ))
    );
  }, [photos, activeSection, activeTopic, activeTag]);

  const yearOptions = useMemo(
    () => getCountOptions(photos.map((photo) => getDateParts(photo)?.year).filter(Boolean)),
    [photos]
  );

  const monthOptions = useMemo(() => {
    if (!activeYear) {
      return [];
    }

    return getCountOptions(
      photos
        .map((photo) => getDateParts(photo))
        .filter((parts) => parts?.year === activeYear)
        .map((parts) => parts.month)
    ).map((option) => ({ ...option, label: formatMonth(option.value) }));
  }, [photos, activeYear]);

  const dayOptions = useMemo(() => {
    if (!activeMonth) {
      return [];
    }

    return getCountOptions(
      photos
        .map((photo) => getDateParts(photo))
        .filter((parts) => parts?.month === activeMonth)
        .map((parts) => parts.day)
    ).map((option) => ({ ...option, label: formatDay(option.value) }));
  }, [photos, activeMonth]);

  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const filteredPhotos = useMemo(() => photos.filter((photo) => {
    if (activeCategory && photo.category !== activeCategory) {
      return false;
    }

    if (activeSection && normalizeValue(photo?.section, UNCATEGORIZED_SECTION) !== activeSection) {
      return false;
    }

    if (activeTopic && normalizeValue(photo?.topic, UNCATEGORIZED_TOPIC) !== activeTopic) {
      return false;
    }

    if (activeTag && !photo.tags?.includes(activeTag)) {
      return false;
    }

    const dateParts = getDateParts(photo);
    if (activeYear && dateParts?.year !== activeYear) {
      return false;
    }
    if (activeMonth && dateParts?.month !== activeMonth) {
      return false;
    }
    if (activeDay && dateParts?.day !== activeDay) {
      return false;
    }

    return !normalizedSearchQuery || getPhotoSearchText(photo).includes(normalizedSearchQuery);
  }), [
    photos,
    activeCategory,
    activeSection,
    activeTopic,
    activeTag,
    activeYear,
    activeMonth,
    activeDay,
    normalizedSearchQuery
  ]);

  function resetTopicFilters() {
    setActiveSection("");
    setActiveTopic("");
    setActiveTag("");
    setShowTags(false);
  }

  function resetDateFilters() {
    setActiveYear("");
    setActiveMonth("");
    setActiveDay("");
  }

  function selectBrowseMode(mode) {
    setBrowseMode(mode);
    setActiveCategory("");
    setSearchQuery("");

    if (mode === "topics") {
      resetDateFilters();
    } else {
      resetTopicFilters();
    }
  }

  function selectSection(section) {
    setBrowseMode("topics");
    setSearchQuery("");
    setActiveCategory("");
    setActiveSection(section);
    setActiveTopic("");
    setActiveTag("");
    setShowTags(false);
    resetDateFilters();
  }

  function selectTopic(topic) {
    setSearchQuery("");
    setActiveTopic(topic);
    setActiveTag("");
    setShowTags(false);
  }

  function selectYear(year) {
    setSearchQuery("");
    setActiveYear(year);
    setActiveMonth("");
    setActiveDay("");
  }

  function selectMonth(month) {
    setSearchQuery("");
    setActiveMonth(month);
    setActiveDay("");
  }

  function selectDay(day) {
    setSearchQuery("");
    setActiveDay(day);
  }

  function selectCategory(category) {
    setSearchQuery("");
    setActiveCategory(category);
    resetTopicFilters();
    resetDateFilters();
  }

  function selectTag(tag) {
    setSearchQuery("");
    setBrowseMode("topics");
    setActiveTag(tag);
    setShowTags(true);
    resetDateFilters();
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
    browseMode,
    activeCategory,
    activeSection,
    activeTopic,
    activeTag,
    activeYear,
    activeMonth,
    activeDay,
    showTags,
    sectionOptions,
    topicOptions,
    tagOptions,
    yearOptions,
    monthOptions,
    dayOptions,
    filteredPhotos,
    selectBrowseMode,
    resetCategory: () => setActiveCategory(""),
    selectCategory,
    resetTopicFilters,
    selectSection,
    selectTopic,
    resetTag: () => setActiveTag(""),
    selectTag,
    resetDateFilters,
    selectYear,
    selectMonth,
    selectDay,
    toggleTags
  };
}
