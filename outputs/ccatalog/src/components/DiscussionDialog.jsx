import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, RatingBadge } from "./common.jsx";
import { RATING_META } from "../lib/domain.js";

const choices = [
  { value: "up", label: "상승", icon: "↑" },
  { value: "keep", label: "유지", icon: "=" },
  { value: "down", label: "하락", icon: "↓" },
];

export default function DiscussionDialog({
  open,
  restaurant,
  userId,
  storeRef,
  onOutcome,
  onClose,
}) {
  const [snapshot, setSnapshot] = useState(null);
  const [comments, setComments] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [body, setBody] = useState("");
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const scope = useRef("");
  const readRevision = useRef(0);
  const lock = useRef(false);
  const expanded = useRef(false);
  const input = useRef(null);
  const identity = useMemo(
    () => (open && restaurant ? { userId, id: restaurant.id } : null),
    [open, restaurant?.id, userId],
  );
  scope.current = identity;

  async function load({ cursor = null, poll = false } = {}) {
    const current = scope.current;
    if (!current) return;
    const request = ++readRevision.current;
    try {
      const value = await storeRef.current.discussion(restaurant.id, cursor);
      if (scope.current !== current || request !== readRevision.current) return;
      setSnapshot(value);
      onOutcome({
        restaurant_id: restaurant.id,
        rating: value.rating,
        round: value.round,
      });
      if (!poll || !expanded.current) {
        const page = value.comments.slice(0, 20);
        setComments((previous) =>
          cursor
            ? [
                ...previous,
                ...page.filter(
                  (item) => !previous.some((old) => old.id === item.id),
                ),
              ]
            : page,
        );
        setHasMore(value.comments.length > 20);
      }
      setError("");
    } catch (error) {
      if (scope.current !== current || request !== readRevision.current) return;
      if (error.message?.includes("restaurant_unavailable"))
        onOutcome({ outcome: "deleted", restaurant_id: restaurant.id });
      else setError("의견을 불러오지 못했습니다. 다시 시도해주세요.");
    }
  }
  useEffect(() => {
    ++readRevision.current;
    setSnapshot(null);
    setComments([]);
    setBody("");
    setEditing(null);
    setError("");
    setMessage("");
    setBusy(false);
    expanded.current = false;
    if (!open || !restaurant) return;
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !lock.current)
        load({ poll: true });
    }, 15000);
    return () => {
      clearInterval(timer);
      ++readRevision.current;
    };
  }, [open, restaurant?.id, userId]);

  async function act(action) {
    if (lock.current || !scope.current) return;
    const current = scope.current;
    lock.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    ++readRevision.current;
    try {
      await action(() => scope.current === current);
    } catch (error) {
      if (scope.current !== current) return;
      if (error.message?.includes("vote_round_changed")) {
        await load();
        setError("메달이 변경됐습니다. 새 투표를 확인해주세요.");
      } else if (error.message?.includes("restaurant_unavailable")) {
        onOutcome({ outcome: "deleted", restaurant_id: restaurant.id });
      } else
        setError("요청을 처리하지 못했습니다. 새로고침 후 다시 시도해주세요.");
    } finally {
      lock.current = false;
      if (scope.current === current) setBusy(false);
    }
  }
  async function vote(choice) {
    if (!snapshot?.can_vote || !snapshot.eligible) return;
    if (
      choice === "down" &&
      snapshot.rating === 1 &&
      !window.confirm(
        "하락이 과반수로 확정되면 이 그룹의 맛집과 사진·댓글·투표가 모두 삭제됩니다. 하락에 투표할까요?",
      )
    )
      return;
    await act(async (active) => {
      const result = await storeRef.current.vote(
        restaurant.id,
        snapshot.round,
        choice,
      );
      if (!active()) return;
      onOutcome(result);
      if (result.outcome === "deleted") return;
      await load();
      setMessage(
        result.outcome === "pending"
          ? "투표를 반영했습니다"
          : `${RATING_META[result.rating].label}로 변경됐습니다. 새 투표가 시작됐어요.`,
      );
    });
  }
  function resetDraft() {
    setBody("");
    setEditing(null);
  }
  return (
    <Modal
      id="discussionDialog"
      labelId="discussionTitle"
      className="discussion-modal"
      open={open}
    >
      <div className="modal-card discussion-card">
        <div className="modal-header discussion-header">
          <div>
            <h2 id="discussionTitle">{restaurant?.name}</h2>
            <p>{restaurant?.group?.name} · 의견과 투표</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="의견 닫기"
            title="닫기"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {!snapshot ? (
          <p role="status">{error || "의견을 불러오고 있습니다"}</p>
        ) : (
          <>
            <section className="medal-voting" aria-label="메달 투표">
              <div className="vote-summary">
                <RatingBadge rating={snapshot.rating} />
                <small>{snapshot.round}번째 투표</small>
              </div>
              <p className="vote-threshold">
                등록자를 제외한 {snapshot.eligible}명
                {snapshot.eligible > 0
                  ? ` 중 ${snapshot.required}명 동의 시 변경`
                  : " · 그룹원이 참여하면 투표가 열려요"}
              </p>
              <div className="vote-options">
                {choices.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    aria-pressed={snapshot.mine === choice.value}
                    disabled={
                      busy ||
                      !snapshot.can_vote ||
                      !snapshot.eligible ||
                      (choice.value === "up" && snapshot.rating === 3)
                    }
                    onClick={() => vote(choice.value)}
                  >
                    <span aria-hidden="true">{choice.icon}</span>
                    <span>{choice.label}</span>
                    <strong>{snapshot.votes[choice.value]}</strong>
                  </button>
                ))}
              </div>
              {!snapshot.can_vote && (
                <p className="discussion-muted">
                  등록자는 투표에 참여할 수 없습니다
                </p>
              )}
            </section>
            <div className="discussion-comments-header">
              <strong>의견 {snapshot.comment_count}</strong>
              <button
                type="button"
                className="icon-button"
                title="새로고침"
                aria-label="의견 새로고침"
                disabled={busy}
                onClick={() => {
                  expanded.current = false;
                  load();
                }}
              >
                ↻
              </button>
            </div>
            <div className="discussion-comments" aria-label="그룹원 의견">
              {!comments.length && (
                <p className="discussion-muted">첫 의견을 남겨보세요</p>
              )}
              {comments.map((comment) => (
                <article className="discussion-comment" key={comment.id}>
                  <header>
                    <strong>{comment.nickname}</strong>
                    <time dateTime={comment.created_at}>
                      {new Date(comment.created_at).toLocaleDateString("ko-KR")}
                    </time>
                  </header>
                  <p>{comment.body}</p>
                  {comment.user_id === userId && (
                    <div className="comment-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(comment.id);
                          setBody(comment.body);
                          input.current?.focus();
                        }}
                      >
                        수정
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm("이 의견을 삭제할까요?"))
                            act(async (active) => {
                              await storeRef.current.deleteComment(comment.id);
                              if (!active()) return;
                              if (editing === comment.id) resetDraft();
                              expanded.current = false;
                              await load();
                            });
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {hasMore && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={busy}
                  onClick={() => {
                    expanded.current = true;
                    act(() => load({ cursor: comments.at(-1) }));
                  }}
                >
                  이전 의견 더 보기
                </button>
              )}
            </div>
            <form
              className="comment-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (body.trim())
                  act(async (active) => {
                    await storeRef.current.saveComment(
                      restaurant.id,
                      body.trim(),
                      editing,
                    );
                    if (!active()) return;
                    resetDraft();
                    expanded.current = false;
                    await load();
                    setMessage(
                      editing ? "의견을 수정했습니다" : "의견을 남겼습니다",
                    );
                  });
              }}
            >
              <textarea
                ref={input}
                aria-label={editing ? "의견 수정" : "의견 작성"}
                placeholder="이 맛집에 대한 의견을 남겨주세요"
                maxLength={1000}
                rows={2}
                required
                value={body}
                onChange={(event) => setBody(event.target.value)}
                disabled={busy}
              />
              <div className="comment-submit">
                {editing && (
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={resetDraft}
                  >
                    취소
                  </button>
                )}
                <button
                  type="submit"
                  className="primary-button"
                  disabled={busy || !body.trim()}
                >
                  {editing ? "수정 완료" : "등록"}
                </button>
              </div>
            </form>
          </>
        )}
        <p className={error ? "auth-error" : "discussion-muted"} role="status">
          {error || message}
        </p>
        {!snapshot && error && (
          <button
            type="button"
            className="secondary-button"
            onClick={() => load()}
          >
            다시 시도
          </button>
        )}
      </div>
    </Modal>
  );
}
