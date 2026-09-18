import Guide from './Guide.jsx';
import Modal from './Modal.jsx';

export default function GuidePopup({ isOpen, onClose, triggerRef }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} triggerRef={triggerRef} ariaLabelledBy="guide-title" className="report-modal knowledge-modal">
      {isOpen && <Guide />}
    </Modal>
  );
}
