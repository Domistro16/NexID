import Modal from 'react-modal'

interface RegisterDetailsModalProps {
  isOpen: boolean
  onRequestClose: () => void
  name: string
  action: string
  duration: string
}

// Set app element for react-modal on client side only
if (typeof window !== 'undefined') {
  Modal.setAppElement(document.body)
}

function RegisterDetailsModal({
  isOpen,
  onRequestClose,
  name,
  action,
  duration,
}: RegisterDetailsModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      closeTimeoutMS={300} // animation duration (matches CSS)
      className="modal-content"
      overlayClassName="modal-overlay"
    >
      {/* Modal content */}
      <div className="p-8 rounded-2xl bg-white dark:bg-neutral-900 shadow-xl relative w-[300px] md:w-[400px] mx-auto flex flex-col gap-6">
        <button
          onClick={onRequestClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
        >
          ×
        </button>

        <h2 className="text-2xl font-bold text-center text-neutral-800 dark:text-white">
          Confirm Details
        </h2>

        <p className="text-center text-gray-500">
          Double check these details before confirming in your wallet.
        </p>

        <div className="flex flex-col gap-3">
          <div className="flex justify-between items-center border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="text-gray-500 text-sm">Name</div>
            <div className="flex items-center gap-2 font-bold text-black dark:text-white text-sm md:text-md">
              {name}
              <div className="w-4 h-4 rounded-full bg-gradient-to-r from-pink-400 to-pink-600" />
            </div>
          </div>

          <div className="flex justify-between items-center border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="text-gray-500 text-sm">Action</div>
            <div className="font-bold text-black dark:text-white text-sm md:text-md">
              {action}
            </div>
          </div>

          <div className="flex justify-between items-center border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <div className="text-gray-500 text-sm">Duration</div>
            <div className="font-bold text-black dark:text-white text-sm md:text-md text-right">
              {duration}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default RegisterDetailsModal
