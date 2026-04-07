import { getPhotoUrl } from "../services/api";
import { processPhoto } from "../services/api";
import { useState } from "react";
import { getPhotoInfo } from "../services/api";


function Gallery({ photos, onOpen, onDelete }) {
  const [infoMap, setInfoMap] = useState({});
  const [processingMap, setProcessingMap] = useState({});

const handleProcess = async (name) => {
  try {
    setProcessingMap((prev) => ({ ...prev, [name]: true }));

    const result = await processPhoto(name);

    // сразу пробуем получить инфо
    const info = await getPhotoInfo(name);

    setInfoMap((prev) => ({
      ...prev,
      [name]: {
        status: info.status,
        title: info.title || "",
        summary: info.summary || "",
        tags: Array.isArray(info.tags) ? info.tags : [],
        error: info.error || null,
      },
    }));

  } catch (e) {
    console.error(e);

    setInfoMap((prev) => ({
      ...prev,
      [name]: {
        status: "error",
        error: e.message,
      },
    }));

  } finally {
    setProcessingMap((prev) => ({ ...prev, [name]: false }));
  }
};


  if (photos.length === 0) {
    return <p className="gallery__empty">Пока тут пусто. Загрузите ваши фото.</p>;
  }

  return (
    
    <section className="gallery">
      {Array.isArray(photos) && photos.map(photo => (
         <div className="gallery__item" key={photo.id}>
            <img
              src={photo.url}
              className="gallery__image"
              alt=""
              onClick={() => onOpen(photo.name)}
            />
            <button onClick={() => onDelete(photo.name)}>Удалить</button>
            <button   onClick={() => handleProcess(photo.name)}   disabled={processingMap[photo.name]} >
              {processingMap[photo.name] ? "Обработка..." : "Обработать"} 
            </button>

            {infoMap[photo.name]?.status === "processing" && (
              <p>Обработка...</p>
            )}

            {infoMap[photo.name]?.status === "processed" && (
              <div>
                <h4>{infoMap[photo.name].title}</h4>
                <p>{infoMap[photo.name].summary}</p>
                <div>
                  {infoMap[photo.name].tags.map((tag) => (
                    <span key={tag}>#{tag} </span>
                  ))}
                </div>
              </div>
            )}

            {infoMap[photo.name]?.status === "no_text" && (
              <div>
                <p>Текст не найден</p>
                <button onClick={() => onDelete(photo.name)}>Удалить</button>
              </div>
            )}

            {infoMap[photo.name]?.status === "error" && (
              <div>
                <p>Ошибка обработки</p>
                {infoMap[photo.name].error && <p>{infoMap[photo.name].error}</p>}
                <button onClick={() => handleProcess(photo.name)}>Повторить</button>
              </div>
            )}

        </div>
      ))}
    </section>
  );
}



export default Gallery;
