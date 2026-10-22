import { useEffect, useRef } from "react";
import "./AdminUsersTable.css";

export default function AdminUserDrawer({ userId, onClose, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement;
    const scrollY = window.scrollY;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    node.showModal();
    return () => {
      node.close();
      document.body.style.overflow = overflow;
      const target = previous?.isConnected ? previous
        : document.querySelector(`[data-admin-user-id="${CSS.escape(String(userId))}"]`);
      target?.focus({ preventScroll: true });
      window.scrollTo({ top: scrollY });
    };
  }, [userId]);
  return <dialog ref={dialog} className="admin-user-drawer" aria-labelledby="user-drawer-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === dialog.current) onClose(); }}>
    <div className="admin-user-drawer__content">
      <header><h2 id="user-drawer-title">Карточка пользователя</h2>
        <button type="button" className="admin-button" autoFocus onClick={onClose} aria-label="Закрыть карточку пользователя">Закрыть</button></header>
      {children}
    </div>
  </dialog>;
}
