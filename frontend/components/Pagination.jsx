export default function Pagination({ currentPage, totalPages, onPageChange }) {
  return (
    <div className="flex justify-center items-center gap-4 mt-10">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-4 py-2 bg-gray-200 text-gray-900 rounded hover:bg-gray-300
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple
                   focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Previous
      </button>
      <span className="text-gray-600">
        Page {currentPage} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-4 py-2 bg-gray-200 text-gray-900 rounded hover:bg-gray-300
                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple
                   focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Next
      </button>
    </div>
  );
}
