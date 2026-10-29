import { useEffect, useRef, useState } from "react";
import { Modal } from "./common.jsx";
import {
  deliverySummary,
  menuItemsSummary,
  normalizeMenuItems,
  RATING_META,
  proposalReviewErrorMessage,
} from "../lib/domain.js";

export default function ProposalReview({ open, catalog, onClose }) {
  const { auth, storeRef, isAdmin, syncAuth, refreshRestaurants } = catalog;
  const [busyId, setBusyId] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setStatus("불러오는 중");
    setError(false);
    syncAuth()
      .then(() => {
        if (alive) setStatus("");
      })
      .catch(() => {
        if (alive) {
          setStatus("맛집 건의를 불러오지 못했습니다");
          setError(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [open, syncAuth]);
  async function review(proposal, decision) {
    if (
      !isAdmin ||
      lock.current ||
      !window.confirm(
        `${proposal.name} 건의를 ${decision === "approved" ? "승인" : "반려"}할까요?`,
      )
    )
      return;
    lock.current = true;
    setBusyId(proposal.id);
    setError(false);
    setStatus("처리 중");
    try {
      await storeRef.current.reviewRestaurantProposal(proposal.id, decision);
      await Promise.all([syncAuth(), refreshRestaurants()]);
      setStatus(
        `${proposal.name} 건의를 ${decision === "approved" ? "승인" : "반려"}했습니다`,
      );
    } catch (error) {
      setStatus(proposalReviewErrorMessage(error));
      setError(true);
    } finally {
      lock.current = false;
      setBusyId(null);
    }
  }
  return (
    <Modal
      id="proposalReviewDialog"
      className="proposal-review-modal"
      labelId="proposalReviewTitle"
      open={open}
    >
      <div className="modal-card proposal-review-card">
        <div className="modal-header proposal-review-header">
          <div>
            <h2 id="proposalReviewTitle">맛집 건의 검토</h2>
            <p>{auth.adminProposals.length}건</p>
          </div>
          <button
            className="icon-button proposal-review-close"
            type="button"
            aria-label="건의 검토 닫기"
            title="닫기"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="proposal-review-list" aria-live="polite">
          {auth.adminProposals.length ? (
            auth.adminProposals.map((proposal) => {
              const rating = RATING_META[proposal.suggested_rating];
              const summary = [
                menuItemsSummary(normalizeMenuItems(proposal.menu_items), 3),
                deliverySummary(proposal.delivery_apps),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <article key={proposal.id} className="proposal-review-item">
                  <div className="proposal-review-item-header">
                    <div>
                      <h3>{proposal.name}</h3>
                      <p>
                        {[proposal.category, proposal.area]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="proposal-rating">
                      {rating?.icon} {rating?.label}
                    </span>
                  </div>
                  {summary && (
                    <p className="proposal-review-summary">{summary}</p>
                  )}
                  {proposal.memo && (
                    <p className="proposal-review-memo">{proposal.memo}</p>
                  )}
                  <div className="proposal-review-actions">
                    <a
                      href={`https://map.naver.com/p/search/${encodeURIComponent(proposal.name)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      네이버지도
                    </a>
                    <button
                      type="button"
                      disabled={Boolean(busyId)}
                      onClick={() => review(proposal, "rejected")}
                    >
                      반려
                    </button>
                    <button
                      className="approve-proposal-button"
                      type="button"
                      disabled={Boolean(busyId)}
                      onClick={() => review(proposal, "approved")}
                    >
                      승인
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="proposal-review-empty">
              검토할 맛집 건의가 없습니다
            </div>
          )}
        </div>
        <p
          className={`proposal-review-status${error ? " is-error" : ""}`}
          aria-live="polite"
        >
          {status}
        </p>
      </div>
    </Modal>
  );
}
