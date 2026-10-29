import { useState } from "react";
import { authErrorMessage } from "../lib/domain.js";

export function memberName(auth) {
  const metadata = auth.user?.user_metadata ?? {};
  return (
    auth.profile?.nickname ||
    metadata.nickname ||
    metadata.name ||
    metadata.full_name ||
    "까탈리스트"
  );
}
const colors = [
  "#5285bc",
  "#b87981",
  "#659378",
  "#9b7eb5",
  "#b78b50",
  "#4e989f",
];

export function MemberAvatar({ auth }) {
  const metadata = auth.user?.user_metadata ?? {};
  const avatar =
    auth.profile?.avatar_url || metadata.avatar_url || metadata.picture;
  const [failed, setFailed] = useState(null);
  return (
    <span className="account-avatar">
      {avatar && avatar !== failed ? (
        <img
          src={avatar}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setFailed(avatar)}
        />
      ) : (
        <span aria-hidden="true">{memberName(auth).slice(0, 1)}</span>
      )}
    </span>
  );
}

export default function AccountPanel({ catalog, open, onClose }) {
  const {
    auth,
    isMember,
    storeRef,
    setAuth,
    syncAuth,
    hiddenGroups,
    setHiddenGroups,
    inviteMessage,
  } = catalog;
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(colors[0]);
  const [link, setLink] = useState("");
  const [notice, setNotice] = useState("");
  async function act(action) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await action();
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
          <strong>연결을 확인해주세요</strong>
          <p>{auth.error}</p>
          <button
            type="button"
            className="auth-secondary-button"
            onClick={() => act(() => syncAuth())}
          >
            다시 시도
          </button>
        </div>
      ) : !isMember ? (
        <>
          <div className="auth-panel-copy">
            <strong>까탈로그 시작하기</strong>
            <p>초대한 사람들과 취향을 나눠보세요</p>
          </div>
          <button
            className="kakao-login-button"
            type="button"
            disabled={busy}
            onClick={() => act(() => storeRef.current.signInWithKakao())}
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
              <small>까탈리스트 · {auth.groups.length}개 그룹</small>
            </span>
          </div>
          <div className="account-groups" aria-label="내 그룹">
            {auth.groups.map((group) => (
              <div className="account-group-row" key={group.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={!hiddenGroups.includes(group.id)}
                    onChange={(event) =>
                      setHiddenGroups((ids) =>
                        event.target.checked
                          ? ids.filter((id) => id !== group.id)
                          : [...ids, group.id],
                      )
                    }
                  />
                  <i style={{ backgroundColor: group.color }} />
                  <span>{group.name}</span>
                </label>
                <button
                  type="button"
                  className="auth-secondary-button"
                  disabled={busy}
                  aria-label={`${group.name} 초대 링크 발급`}
                  onClick={() =>
                    act(async () => {
                      if (
                        !window.confirm(
                          "새 초대 링크를 발급할까요? 기존 초대 링크는 만료됩니다.",
                        )
                      )
                        return;
                      const value = await storeRef.current.createInvite(
                        group.id,
                      );
                      setLink(value);
                      try {
                        await navigator.clipboard.writeText(value);
                        setNotice("초대 링크를 복사했습니다");
                      } catch {
                        setNotice("초대 링크를 선택해 복사해주세요");
                      }
                    })
                  }
                >
                  초대
                </button>
              </div>
            ))}
          </div>
          <form
            className="group-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim())
                act(async () => {
                  await storeRef.current.createGroup(name.trim(), color);
                  setName("");
                  await syncAuth();
                  setNotice("그룹을 만들었습니다");
                });
            }}
          >
            <div className="group-create-entry">
              <input
                aria-label="새 그룹 이름"
                placeholder="새 그룹 이름"
                maxLength={40}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <button
                className="auth-secondary-button"
                type="submit"
                disabled={busy}
              >
                만들기
              </button>
            </div>
            <div className="group-colors" role="group" aria-label="그룹 색상">
              {colors.map((value, index) => (
                <button
                  type="button"
                  key={value}
                  aria-label={`그룹 색상 ${index + 1}`}
                  aria-pressed={color === value}
                  style={{ backgroundColor: value }}
                  onClick={() => setColor(value)}
                />
              ))}
            </div>
          </form>
          {!!link && (
            <input
              className="invite-link"
              aria-label="초대 링크"
              readOnly
              value={link}
              onFocus={(event) => event.target.select()}
            />
          )}
          <button
            className="auth-secondary-button"
            type="button"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await storeRef.current.signOut();
                setLink("");
                await syncAuth();
                onClose();
              })
            }
          >
            로그아웃
          </button>
        </>
      )}
      {(notice || inviteMessage) && (
        <p className="auth-status" role="status">
          {notice || inviteMessage}
        </p>
      )}
      {auth.error && auth.status !== "unavailable" && (
        <p className="auth-error">{auth.error}</p>
      )}
    </section>
  );
}
