import axios from "axios";
import { API_URL } from "./api";
import { DOCUMENT_PAGE_LIMIT } from "../../../shared/documentLimits.mjs";

const read = path => axios.get(`${API_URL}/api/${path}`).then(r=>r.data);
const write = (path,body,method="post") => axios[method](`${API_URL}/api/${path}`,body).then(r=>r.data);
export const listDocuments = () => read("documents");
export const getDocument = id => read(`documents/${encodeURIComponent(id)}`);
export const getDocumentLocation = filename => read(`document-location/${encodeURIComponent(filename)}`);
export const mergeDocuments = body => write("documents/merge",body);
export const reorderDocument = (id,body) => write(`documents/${id}/page-order`,body,"put");
export const extractPage = (id,body) => write(`documents/${id}/extract`,body);
export const splitDocument = (id,body) => write(`documents/${id}/split`,body);
export const appendArchiveDocuments = (id,body) => write(`documents/${id}/append-from-archive`,body);
export const deleteDocuments = body => write("documents/delete-batch",body);
export const beginUpload = body => write("document-uploads",body);
export const getUpload = id => read(`document-uploads/${id}`);
export const closeUpload = (id,cancel=false) => write(`document-uploads/${id}/${cancel?"cancel":"finish"}`,{});
export function storeUploadItem(batchId,itemId,file) {
  const body=new FormData();body.append("photo",file);
  return write(`document-uploads/${batchId}/items/${itemId}`,body,"put");
}
export function documentErrorMessage(error) {
  const code=error.response?.data?.error;
  return ({DOCUMENT_VERSION_CONFLICT:"Документ изменился в другой вкладке. Обновите его и повторите действие.",
    DOCUMENT_BUSY:"Дождитесь завершения обработки или проверки заявки.",ACCOUNT_BUSY:"В другой вкладке идёт операция. Дождитесь её завершения и повторите.",
    UPLOAD_BATCH_ACTIVE:"Дождитесь завершения загрузки страниц.",DOCUMENT_PAGE_LIMIT:`В одном документе может быть не больше ${DOCUMENT_PAGE_LIMIT} страниц.`,
    MULTIPAGE_MERGE_NOT_SUPPORTED:"Пока можно объединять только одностраничные документы. Уберите многостраничные из выбора.",
    UPLOAD_ITEM_CONTENT_CHANGED:"Этот файл отличается от выбранного ранее. Выберите исходный файл или начните новую загрузку.",
    UPLOAD_BATCH_CLOSED:"Эта загрузка уже завершена. Сохранённые страницы остались в архиве.",
    PAGE_REPLACEMENT_NOT_ALLOWED:"Заменить фото можно только у страницы с ошибкой или без текста.",
    INSUFFICIENT_PROCESSING_BALANCE:`1 фото — 1 обработка. Вы выбрали ${error.response?.data?.selected} фото, а доступно ${error.response?.data?.available} обработок. Уменьшите выбор или пополните баланс.`})[code]
    || (error.response?"Не удалось выполнить действие. Обновите документ и повторите.":"Нет ответа сервера. Сохранённые страницы не потеряны; проверьте документ перед повтором.");
}
