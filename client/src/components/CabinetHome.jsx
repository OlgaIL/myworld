import AccessLimitMessage from "./AccessLimitMessage";
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
  activeCategory,
  activeTag,
  showTags,
  categoryOptions,
  tagOptions,
  resetCategory,
  applyCategoryFilter,
  resetTag,
  applyTagFilter,
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

          {categoryOptions.length > 0 && (
            <div className="cabinet-categories" aria-label="Фильтр по рубрикам">
              <button
                className={`cabinet-categories__button ${!activeCategory ? "cabinet-categories__button--active" : ""}`}
                type="button"
                onClick={resetCategory}
              >
                Все
              </button>
              {categoryOptions.map((category) => (
                <button
                  className={`cabinet-categories__button ${activeCategory === category ? "cabinet-categories__button--active" : ""}`}
                  type="button"
                  key={category}
                  onClick={() => applyCategoryFilter(category)}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          {tagOptions.length > 0 && (
            <div className="cabinet-tags">
              <button
                className="cabinet-tags__toggle"
                type="button"
                onClick={toggleTags}
                aria-expanded={showTags}
              >
                Ваши теги
                <span className="cabinet-tags__chevron" aria-hidden="true" />
              </button>

              {(showTags || activeTag) && (
                <div className="cabinet-tags__list" aria-label="Фильтр по тегам">
                  {activeTag && (
                    <button
                      className="cabinet-categories__button"
                      type="button"
                      onClick={resetTag}
                    >
                      Все теги
                    </button>
                  )}
                  {tagOptions.map((tag) => (
                    <button
                      className={`cabinet-categories__button ${activeTag === tag ? "cabinet-categories__button--active" : ""}`}
                      type="button"
                      key={tag}
                      onClick={() => applyTagFilter(tag)}
                    >
                      #{tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {photosCount > 0 || pendingPhotos.length > 0 ? (
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
