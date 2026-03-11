import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <div className="p-8 text-center space-y-3">
      <h2 className="text-2xl font-bold">Not found</h2>
      <p className="text-neutral-600">The requested page does not exist.</p>
      <Link to="/products" className="text-blue-600 underline">Go to products</Link>
    </div>
  );
}
