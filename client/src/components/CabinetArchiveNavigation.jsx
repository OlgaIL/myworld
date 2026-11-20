function FilterButton({ active, children, onClick }) {
  return (
    <button
      className={`cabinet-categories__button ${active ? "cabinet-categories__button--active" : ""}`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function CountOptions({ options, activeValue, onSelect }) {
  return options.map((option) => (
    <FilterButton
      active={activeValue === option.value}
      key={option.value}
      onClick={() => onSelect(option.value)}
    >
      {option.label || option.value} <span className="cabinet-navigation__count">{option.count}</span>
    </FilterButton>
  ));
}

function CabinetArchiveNavigation({
  photosCount,
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
  onModeChange,
  onResetCategory,
  onResetTopics,
  onSelectSection,
  onSelectTopic,
  onResetTag,
  onSelectTag,
  onResetDates,
  onSelectYear,
  onSelectMonth,
  onSelectDay,
  onToggleTags
}) {
  const hasTopicContext = Boolean(activeSection || activeTopic || activeTag);

  return (
    <div className="cabinet-navigation">
      <div className="cabinet-navigation__modes" aria-label="Способ навигации по архиву">
        <button
          className={`cabinet-navigation__mode ${browseMode === "topics" ? "cabinet-navigation__mode--active" : ""}`}
          type="button"
          onClick={() => onModeChange("topics")}
        >
          По темам
        </button>
        <button
          className={`cabinet-navigation__mode ${browseMode === "dates" ? "cabinet-navigation__mode--active" : ""}`}
          type="button"
          onClick={() => onModeChange("dates")}
        >
          По дате
        </button>
      </div>

      {activeCategory && (
        <div className="cabinet-navigation__active-filter">
          Тип: {activeCategory}
          <button type="button" onClick={onResetCategory}>Сбросить</button>
        </div>
      )}

      {browseMode === "topics" && (
        <>
          <div className="cabinet-navigation__row" aria-label="Разделы записей">
            <FilterButton
              active={!activeSection && !activeCategory}
              onClick={() => {
                onResetCategory();
                onResetTopics();
              }}
            >
              Все записи <span className="cabinet-navigation__count">{photosCount}</span>
            </FilterButton>
            <CountOptions options={sectionOptions} activeValue={activeSection} onSelect={onSelectSection} />
          </div>

          {activeSection && topicOptions.length > 0 && (
            <div className="cabinet-navigation__subsection">
              <p className="cabinet-navigation__label">Темы</p>
              <div className="cabinet-navigation__row" aria-label="Темы записей">
                <FilterButton active={!activeTopic} onClick={() => onSelectSection(activeSection)}>
                  Все
                </FilterButton>
                <CountOptions options={topicOptions} activeValue={activeTopic} onSelect={onSelectTopic} />
              </div>
            </div>
          )}

          {hasTopicContext && tagOptions.length > 0 && (
            <div className="cabinet-tags">
              <button
                className="cabinet-tags__toggle"
                type="button"
                onClick={onToggleTags}
                aria-expanded={showTags}
              >
                Теги в выбранном разделе · {tagOptions.length}
                <span className="cabinet-tags__chevron" aria-hidden="true" />
              </button>

              {(showTags || activeTag) && (
                <div className="cabinet-tags__list" aria-label="Теги выбранного раздела">
                  {activeTag && (
                    <FilterButton active={false} onClick={onResetTag}>Все теги</FilterButton>
                  )}
                  <CountOptions options={tagOptions} activeValue={activeTag} onSelect={onSelectTag} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {browseMode === "dates" && (
        <>
          <div className="cabinet-navigation__row" aria-label="Годы загрузки">
            <FilterButton
              active={!activeYear && !activeCategory}
              onClick={() => {
                onResetCategory();
                onResetDates();
              }}
            >
              Все записи <span className="cabinet-navigation__count">{photosCount}</span>
            </FilterButton>
            <CountOptions options={yearOptions} activeValue={activeYear} onSelect={onSelectYear} />
          </div>

          {activeYear && monthOptions.length > 0 && (
            <div className="cabinet-navigation__subsection">
              <p className="cabinet-navigation__label">Месяц</p>
              <div className="cabinet-navigation__row" aria-label="Месяцы загрузки">
                <FilterButton active={!activeMonth} onClick={() => onSelectYear(activeYear)}>Весь год</FilterButton>
                <CountOptions options={monthOptions} activeValue={activeMonth} onSelect={onSelectMonth} />
              </div>
            </div>
          )}

          {activeMonth && dayOptions.length > 0 && (
            <div className="cabinet-navigation__subsection">
              <p className="cabinet-navigation__label">День</p>
              <div className="cabinet-navigation__row" aria-label="Дни загрузки">
                <FilterButton active={!activeDay} onClick={() => onSelectMonth(activeMonth)}>Весь месяц</FilterButton>
                <CountOptions options={dayOptions} activeValue={activeDay} onSelect={onSelectDay} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default CabinetArchiveNavigation;
