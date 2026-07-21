import { useCallback, useEffect, useState } from "react";
import { LEGAL_AGREEMENT_STORAGE_KEY, LEGAL_AGREEMENT_VERSION } from "../constants/legalAgreement";
import { acceptLegalAgreement as acceptLegalAgreementRequest } from "../services/api";

function hasAcceptedLegalAgreement() {
  const value = localStorage.getItem(LEGAL_AGREEMENT_STORAGE_KEY);
  return value === "true" || value === LEGAL_AGREEMENT_VERSION;
}

function markLocalLegalAgreementAccepted() {
  localStorage.setItem(LEGAL_AGREEMENT_STORAGE_KEY, LEGAL_AGREEMENT_VERSION);
}

function hasUserAcceptedLegalAgreement(user) {
  return Boolean(user?.legalAcceptedAt && user?.legalVersion === LEGAL_AGREEMENT_VERSION);
}

export function useLegalAgreement({ user, reloadUser } = {}) {
  const [pendingAction, setPendingAction] = useState(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!user?.id || hasUserAcceptedLegalAgreement(user) || !hasAcceptedLegalAgreement()) {
      return undefined;
    }

    let cancelled = false;

    async function syncLegalAgreement() {
      try {
        await acceptLegalAgreementRequest(LEGAL_AGREEMENT_VERSION);
        if (!cancelled) {
          await reloadUser?.();
        }
      } catch (error) {
        console.error("Legal agreement sync failed:", error);
      }
    }

    syncLegalAgreement();

    return () => {
      cancelled = true;
    };
  }, [reloadUser, user]);

  const requestLegalAgreement = useCallback((action) => {
    if (hasUserAcceptedLegalAgreement(user)) {
      action?.();
      return;
    }

    if (!user?.id && hasAcceptedLegalAgreement()) {
      action?.();
      return;
    }

    setPendingAction(() => action || null);
  }, [user]);

  const closeLegalAgreement = useCallback(() => {
    setPendingAction(null);
  }, []);

  const acceptLegalAgreement = useCallback(async () => {
    if (accepting) {
      return;
    }

    try {
      setAccepting(true);
      markLocalLegalAgreementAccepted();

      if (user?.id) {
        await acceptLegalAgreementRequest(LEGAL_AGREEMENT_VERSION);
        await reloadUser?.();
      }

      const action = pendingAction;
      setPendingAction(null);
      action?.();
    } catch (error) {
      console.error("Legal agreement accept failed:", error);
    } finally {
      setAccepting(false);
    }
  }, [accepting, pendingAction, reloadUser, user]);

  return {
    legalAgreementOpen: Boolean(pendingAction),
    legalAgreementAccepting: accepting,
    requestLegalAgreement,
    acceptLegalAgreement,
    closeLegalAgreement
  };
}
