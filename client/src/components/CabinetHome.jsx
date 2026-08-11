import AccessLimitMessage from "./AccessLimitMessage";
import CabinetArchiveNavigation from "./CabinetArchiveNavigation";
import CabinetEmptyState from "./CabinetEmptyState";
import Gallery from "./Gallery";

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function CabinetHome({
  user,
  recordsUsed,
  photosCount,
  pendingPhotos,
  filteredPhotos,
  uploadMessage,
  uploading,
  recordUploadAllowed,
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
  selectBrowseMode,
  resetCategory,
  resetTopicFilters,
  selectSection,
  selectTopic,
  resetTag,
  applyTagFilter,
  resetDateFilters,
  selectYear,
  selectMonth,
  selectDay,
  toggleTags,
  fileInputRef,
  onRequestUpload,
  handleUpload,
  onOpenImage,
  onOpenDocument,
  onDelete,
  onSelectCategory,
  onSelectTag
}) {
  return (
    <>
      {photosCount > 0 && (
        <section className="upload-panel upload-panel--cabinet">
          <button
            className="guest-upload-button"
            type="button"
            onClick={onRequestUpload}
            disabled={uploading || !recordUploadAllowed}
          >
            Загрузить запись
          </button>
          <p className="guest-hero__counter upload-panel__counter">
            Загружено записей: {recordsUsed}
          </p>
          {!uploading && <AccessLimitMessage user={user} />}
        </section>
      )}

      {photosCount > 0 && (
        <section className="cabinet-filter">
          <div className="cabinet-search">
            <input
              className="cabinet-search__input"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Фильтр/поиск"
              aria-label="Фильтр/поиск"
            />
          </div>

          <CabinetArchiveNavigation
            photosCount={photosCount}
            browseMode={browseMode}
            activeCategory={activeCategory}
            activeSection={activeSection}
            activeTopic={activeTopic}
            activeTag={activeTag}
            activeYear={activeYear}
            activeMonth={activeMonth}
            activeDay={activeDay}
            showTags={showTags}
            sectionOptions={sectionOptions}
            topicOptions={topicOptions}
            tagOptions={tagOptions}
            yearOptions={yearOptions}
            monthOptions={monthOptions}
            dayOptions={dayOptions}
            onModeChange={selectBrowseMode}
            onResetCategory={resetCategory}
            onResetTopics={resetTopicFilters}
            onSelectSection={selectSection}
            onSelectTopic={selectTopic}
            onResetTag={resetTag}
            onSelectTag={applyTagFilter}
            onResetDates={resetDateFilters}
            onSelectYear={selectYear}
            onSelectMonth={selectMonth}
            onSelectDay={selectDay}
            onToggleTags={toggleTags}
          />
        </section>
      )}

      {photosCount > 0 || pendingPhotos.length > 0 ? (
        <div className={photosCount === 0 && pendingPhotos.length > 0 ? "cabinet-first-upload" : ""}>
          <Gallery
            photos={filteredPhotos}
            pendingPhotos={pendingPhotos}
            onOpen={onOpenImage}
            onOpenDocument={onOpenDocument}
            onDelete={onDelete}
            uploadMessage={uploadMessage}
            emptyMessage="Ничего не найдено."
            onSelectCategory={onSelectCategory}
            onSelectTag={onSelectTag}
          />
        </div>
      ) : (
        <>
          <CabinetEmptyState
            uploading={uploading}
            uploadAllowed={recordUploadAllowed}
            onUpload={onRequestUpload}
          />
          <div className="cabinet-empty-state__meta">
            <p className="guest-hero__counter upload-panel__counter">
              Загружено записей: {recordsUsed}
            </p>
            {!uploading && <AccessLimitMessage user={user} />}
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        className="upload-input"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleUpload}
        disabled={uploading || !recordUploadAllowed}
      />

      {photosCount >= 5 && (
        <button
          className="fab-upload"
          type="button"
          onClick={onRequestUpload}
          disabled={uploading || !recordUploadAllowed}
          title="Добавить запись"
          aria-label="Добавить запись"
        >
          <PlusIcon />
        </button>
      )}
    </>
  );
}

export default CabinetHome;
