import { useEffect, useRef, useId } from 'react';

export default function Modal({ isOpen, onClose, title, children, triggerRef, className = 'report-modal', ariaLabelledBy, ariaLabel, dismissOnBackdrop = false, animateFromTrigger = false }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  const closingAnimation = useRef(null);
  
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
        document.body.classList.add('scroll-lock');
        if (animateFromTrigger && triggerRef?.current && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          const origin = triggerRef.current.closest('.card')?.getBoundingClientRect();
          const destination = dialog.getBoundingClientRect();
          if (origin && destination.width && destination.height) {
            const x = origin.left + origin.width / 2 - destination.left - destination.width / 2;
            const y = origin.top + origin.height / 2 - destination.top - destination.height / 2;
            dialog.animate?.([
              { transform: `translate(${x}px, ${y}px) scale(${origin.width / destination.width}, ${origin.height / destination.height})`, opacity: .3 },
              { transform: 'none', opacity: 1 }
            ], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
          }
        }
      }
    } else {
      if (dialog.open) {
        dialog.close();
      }
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('scroll-lock');
      if (dialog.dataset.wasOpen && triggerRef?.current?.isConnected) {
        triggerRef.current.focus();
      }
      delete dialog.dataset.wasOpen;
    }
    if (isOpen) dialog.dataset.wasOpen = 'true';
  }, [isOpen, triggerRef, animateFromTrigger]);

  // Clean up lock on unmount
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = triggerRef?.current;
    return () => {
      closingAnimation.current?.cancel();
      closingAnimation.current = null;
      const wasOpen = dialog?.open;
      if (wasOpen) dialog.close();
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('scroll-lock');
      if (wasOpen && trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [triggerRef]);

  const handleClose = (e) => {
    // Prevent default so we handle the state synchronization
    if (e && e.type === 'cancel') {
      e.preventDefault();
    }
    if (!isOpen || closingAnimation.current) return;
    const dialog = dialogRef.current;
    const finishClose = () => {
      const trigger = triggerRef?.current;
      onClose();
      // Native dialog restoration can run during React's removal of the panel.
      // Restore the originating card after that removal has completed.
      if (animateFromTrigger) requestAnimationFrame(() => {
        if (trigger?.isConnected && !document.querySelector('dialog[open]')) trigger.focus({ preventScroll: true });
      });
    };
    const origin = triggerRef?.current?.closest('.card')?.getBoundingClientRect();
    if (animateFromTrigger && dialog?.animate && origin && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const destination = dialog.getBoundingClientRect();
      const x = origin.left + origin.width / 2 - destination.left - destination.width / 2;
      const y = origin.top + origin.height / 2 - destination.top - destination.height / 2;
      const animation = dialog.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${x}px, ${y}px) scale(${origin.width / destination.width}, ${origin.height / destination.height})`, opacity: 0 }
      ], { duration: 200, easing: 'ease-in', fill: 'forwards' });
      closingAnimation.current = animation;
      animation.finished.then(() => { closingAnimation.current = null; finishClose(); }).catch(() => {});
    } else finishClose();
  };

  return (
    <dialog ref={dialogRef} onClick={event => { if (dismissOnBackdrop && event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) handleClose(); } }} onCancel={handleClose} className={className} aria-label={ariaLabel} aria-labelledby={!ariaLabel ? (ariaLabelledBy || (title ? titleId : undefined)) : undefined}>
      <div className="report-modal-content">
        <button type="button" className="close-btn" onClick={handleClose} aria-label="Cerrar">×</button>
        {title && <h2 id={titleId} style={{ marginTop: 0 }}>{title}</h2>}
        {children}
      </div>
    </dialog>
  );
}
