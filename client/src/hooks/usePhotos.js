import { useEffect, useState } from "react";
import { getPhotos, uploadPhoto, deletePhoto } from "../services/api";

export function usePhotos() {
  const [photos, setPhotos] = useState([]);

  function loadPhotos() {
    getPhotos().then(setPhotos);
  }

  function addPhoto(file) {
    return uploadPhoto(file).then(loadPhotos);
  }

  function removePhoto(name) {
    return deletePhoto(name).then(loadPhotos);
  }

  useEffect(() => {
    loadPhotos();
  }, []);

  return {
    photos,
    addPhoto,
    removePhoto
  };
}
