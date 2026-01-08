import { getPhotoUrl } from "../services/api";

function Gallery({ photos, onOpen, onDelete }) {
  if (photos.length === 0) {
    return <p className="gallery__empty">Пока тут пусто. Загрузите ваши фото.</p>;
  }

  return (
    <section className="gallery">
      {photos.map(name => (
        <div className="gallery__item" key={name}>
          <img
            src={getPhotoUrl(name)}
            className="gallery__image"
            alt=""
            onClick={() => onOpen(name)}
          />
          <button onClick={() => onDelete(name)}>Удалить</button>
        </div>
      ))}
    </section>
  );
}

export default Gallery;
