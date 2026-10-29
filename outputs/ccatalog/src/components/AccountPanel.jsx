import { useState } from "react";
import { authErrorMessage } from "../lib/domain.js";

export const modeLabel = (mode) =>
  ({ member: "일반회원", catalist: "까탈리스트", admin: "관리자" })[mode];
export function memberName(auth) {
  const metadata = auth.user?.user_metadata ?? {};
  return (
    auth.profile?.nickname ||
    metadata.nickname ||
    metadata.name ||
    metadata.full_name ||
    "까탈로그 회원"
  );
}

export default function AccountPanel({
  catalog,
  open,
  onClose,
  onMode,
  onReview,
}) {
  const {
    auth,
    isMember,
    isAdmin,
    isCatalist,
    mode,
    storeRef,
    setAuth,
    syncAuth,
  } = catalog;
  const [busy, setBusy] = useState(false);
  async function act(action) {
    if (busy) return;
    setBusy(true);
    try {
      if (action === "login") await storeRef.current.signInWithKakao();
      else {
        await storeRef.current.signOut();
        await syncAuth();
        onClose();
      }
    } catch (error) {
      setAuth((auth) => ({ ...auth, error: authErrorMessage(error) }));
    } finally {
      setBusy(false);
    }
  }
  const metadata = auth.user?.user_metadata ?? {};
  const avatar =
    auth.profile?.avatar_url || metadata.avatar_url || metadata.picture;
  return (
    <section
      id="authPanel"
      className={`auth-panel${open ? " is-open" : ""}`}
      aria-label="회원 계정"
      aria-hidden={!open}
      aria-live="polite"
      inert={!open}
    >
      {auth.status === "loading" ? (
        <p className="auth-status">계정을 확인하고 있습니다</p>
      ) : auth.status === "unavailable" ? (
        <div className="auth-panel-copy">
          <strong>로그인을 준비하지 못했습니다</strong>
          <p>{auth.error || "Supabase 연결을 확인해주세요"}</p>
        </div>
      ) : !isMember ? (
        <>
          <div className="auth-panel-copy">
            <strong>까탈로그 시작하기</strong>
            <p>방문을 인증하고 까탈리스트에 도전하세요</p>
          </div>
          <button
            className="kakao-login-button"
            type="button"
            disabled={busy}
            onClick={() => act("login")}
          >
            <span className="kakao-symbol" aria-hidden="true">
              ●
            </span>
            <span>카카오로 시작하기</span>
          </button>
        </>
      ) : (
        <>
          <div className="member-summary">
            <span className="member-avatar">
              {avatar ? (
                <img src={avatar} alt="" referrerPolicy="no-referrer" />
              ) : (
                <span aria-hidden="true">{memberName(auth).slice(0, 1)}</span>
              )}
            </span>
            <span className="member-copy">
              <strong>{memberName(auth)}</strong>
              <small>
                {auth.isAdmin
                  ? `관리자 계정 · ${modeLabel(mode)} 모드`
                  : auth.profile?.is_catalist
                    ? "까탈리스트"
                    : "회원"}{" "}
                · 방문 {auth.visitCount}곳
              </small>
            </span>
          </div>
          <div className="auth-panel-actions">
            {auth.isAdmin && (
              <div
                className="account-mode-control"
                role="group"
                aria-label="사용 모드"
              >
                {["member", "catalist", "admin"].map((value) => (
                  <button
                    key={value}
                    className={`account-mode-option${mode === value ? " is-active" : ""}`}
                    type="button"
                    aria-pressed={mode === value}
                    onClick={() => onMode(value)}
                  >
                    {modeLabel(value)}
                  </button>
                ))}
              </div>
            )}
            {isAdmin && (
              <button
                className="auth-secondary-button review-proposals-button"
                type="button"
                onClick={onReview}
              >
                <span>맛집 건의 검토</span>
                <strong>{auth.adminProposals.length}</strong>
              </button>
            )}
            <button
              className="auth-secondary-button"
              type="button"
              disabled={busy}
              onClick={() => act("logout")}
            >
              로그아웃
            </button>
          </div>
          {isCatalist && (
            <section className="member-proposals" aria-label="내 맛집 건의">
              <strong>내 맛집 건의</strong>
              {auth.proposals.length ? (
                auth.proposals.slice(0, 3).map((proposal) => (
                  <div key={proposal.id} className="proposal-status-row">
                    <span>{proposal.name}</span>
                    <small data-status={proposal.status}>
                      {
                        {
                          approved: "승인",
                          rejected: "반려",
                          pending: "검토 중",
                        }[proposal.status]
                      }
                    </small>
                  </div>
                ))
              ) : (
                <p className="proposal-empty">접수된 맛집 건의가 없습니다</p>
              )}
            </section>
          )}
        </>
      )}
      {auth.error && auth.status !== "unavailable" && (
        <p className="auth-error">{auth.error}</p>
      )}
    </section>
  );
}
