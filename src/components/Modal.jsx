import { useEffect, useRef } from 'react';

export default function Modal({ isOpen, onClose, title, children, triggerRef, className = 'report-modal' }) {
  const dialogRef = useRef(null);
  
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
        document.body.classList.add('scroll-lock');
      }
    } else {
      if (dialog.open) {
        dialog.close();
        document.body.classList.remove('scroll-lock');
        if (triggerRef?.current) {
          triggerRef.current.focus();
        }
      }
    }
  }, [isOpen, triggerRef]);

  // Clean up lock on unmount
  useEffect(() => {
    return () => {
      document.body.classList.remove('scroll-lock');
    };
  }, []);

  const handleClose = () => {
    // Only call onClose if the dialog is logically open.
    // Native dialog fires 'close' event when closed programmatically or via ESC.
    if (isOpen) {
      onClose();
    }
  };

  return (
    <dialog ref={dialogRef} onCancel={handleClose} onClose={handleClose} className={className}>
      <div className="report-modal-content">
        <button type="button" className="close-btn" onClick={() => { if(isOpen) onClose(); }} aria-label="Cerrar">X</button>
        {title && <h2 style={{ marginTop: 0 }}>{title}</h2>}
        {children}
      </div>
    </dialog>
  );
}
