import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { listActivity, type ActivityRecord } from "../lib/data";
import { formatDateTime } from "../lib/time";

export function ProductActivityPage() {
  const { productId = "" } = useParams();
  const [activity, setActivity] = useState<ActivityRecord[]>([]);

  useEffect(() => {
    if (!productId) return;
    void listActivity(productId).then(setActivity);
  }, [productId]);

  return (
    <div className="p-4 lg:p-8 pb-20 lg:pb-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Activity</h1>
      <div className="bg-white border border-neutral-200 rounded-lg">
        {activity.map((item) => (
          <div key={item.id} className="p-4 border-t first:border-t-0 border-neutral-100">
            <p className="text-sm">{item.message}</p>
            <p className="text-xs text-neutral-500 mt-1">{item.type}</p>
            <p className="text-xs text-neutral-400 mt-1">{formatDateTime(item.createdAt)}</p>
          </div>
        ))}
        {activity.length === 0 ? <p className="p-4 text-neutral-500">No activity yet.</p> : null}
      </div>
    </div>
  );
}
