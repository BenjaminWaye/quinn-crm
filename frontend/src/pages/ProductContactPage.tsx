import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { formatDateTime } from "../lib/time";
import { deleteContact, getContact, listContactActivity, updateContact, type ContactActivityRecord, type ContactRecord } from "../lib/data";

export function ProductContactPage() {
  const { productId = "", contactId = "" } = useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState<ContactRecord | null>(null);
  const [activity, setActivity] = useState<ContactActivityRecord[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("lead");
  const [status, setStatus] = useState("new");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [website, setWebsite] = useState("");
  const [location, setLocation] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [notes, setNotes] = useState("");
  const [initialSnapshot, setInitialSnapshot] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const buildPayload = () => ({
    name: name.trim(),
    kind,
    status,
    company: company.trim(),
    title: title.trim(),
    email: email.trim(),
    phone: phone.trim(),
    linkedin: linkedin.trim(),
    website: website.trim(),
    location: location.trim(),
    tags: tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    notes: notes.trim(),
  });

  const load = async () => {
    if (!productId || !contactId) return;
    const [next, nextActivity] = await Promise.all([getContact(productId, contactId), listContactActivity(productId, contactId)]);
    setContact(next);
    setActivity(nextActivity);
    setName(next?.name ?? "");
    setKind(next?.kind ?? "lead");
    setStatus(next?.status ?? "new");
    setCompany(next?.company ?? "");
    setTitle(next?.title ?? "");
    setEmail(next?.email ?? "");
    setPhone(next?.phone ?? "");
    setLinkedin(next?.linkedin ?? "");
    setWebsite(next?.website ?? "");
    setLocation(next?.location ?? "");
    setTagsText((next?.tags ?? []).join(", "));
    setNotes(next?.notes ?? "");
    const snapshot = {
      name: (next?.name ?? "").trim(),
      kind: next?.kind ?? "lead",
      status: next?.status ?? "new",
      company: (next?.company ?? "").trim(),
      title: (next?.title ?? "").trim(),
      email: (next?.email ?? "").trim(),
      phone: (next?.phone ?? "").trim(),
      linkedin: (next?.linkedin ?? "").trim(),
      website: (next?.website ?? "").trim(),
      location: (next?.location ?? "").trim(),
      tags: next?.tags ?? [],
      notes: (next?.notes ?? "").trim(),
    };
    setInitialSnapshot(JSON.stringify(snapshot));
  };

  const onDelete = async () => {
    if (!productId || !contactId || deleting) return;
    if (!window.confirm("Delete this contact permanently?")) return;
    try {
      setDeleting(true);
      setError("");
      await deleteContact({ productId, contactId });
      navigate(`/products/${productId}/crm`);
    } catch (nextError) {
      setError((nextError as Error)?.message || "Failed to delete contact");
      console.error("Failed to delete contact", nextError);
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => { void load(); }, [productId, contactId]);

  const hasChanges = useMemo(() => {
    if (!initialSnapshot) return false;
    return JSON.stringify(buildPayload()) !== initialSnapshot;
  }, [company, email, initialSnapshot, kind, linkedin, location, name, notes, phone, status, tagsText, title, website]);

  const onSave = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!productId || !contactId || !name.trim() || busy) return;
    try {
      setBusy(true);
      setError("");
      await updateContact({
        productId,
        contactId,
        patch: buildPayload(),
      });
      await load();
    } catch (nextError) {
      setError((nextError as Error)?.message || "Failed to save contact");
      console.error("Failed to save contact", nextError);
    } finally {
      setBusy(false);
    }
  };

  if (!contact) return <div className="p-6">Contact not found.</div>;

  return (
    <div className="p-4 lg:p-8 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Contact</h1>
      <form className="bg-white border border-neutral-200 rounded-lg p-4 space-y-3" onSubmit={(event) => void onSave(event)}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Title / role" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="LinkedIn URL" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Website" value={website} onChange={(e) => setWebsite(e.target.value)} />
          <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <select className="border border-neutral-300 rounded-lg px-3 py-2" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="lead">lead</option><option value="customer">customer</option><option value="partner">partner</option><option value="investor">investor</option><option value="vendor">vendor</option><option value="other">other</option>
          </select>
          <select className="border border-neutral-300 rounded-lg px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="new">new</option><option value="contacted">contacted</option><option value="interested">interested</option><option value="follow_up">follow_up</option><option value="customer">customer</option><option value="inactive">inactive</option>
          </select>
        </div>
        <input className="w-full border border-neutral-300 rounded-lg px-3 py-2" placeholder="Tags (comma separated)" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[120px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60" disabled={busy || !name.trim() || deleting || !hasChanges}>
            {busy ? "Saving..." : "Save"}
          </button>
          <button type="button" onClick={() => void onDelete()} className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-60" disabled={deleting || busy}>
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      <section className="bg-white border border-neutral-200 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-3">Activity stream</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-neutral-500">No contact activity yet.</p>
        ) : (
          <div className="space-y-3">
            {activity.map((item) => (
              <article key={item.id} className="rounded-lg border border-neutral-200 p-3">
                <p className="text-sm font-medium">{item.message}</p>
                <p className="text-xs text-neutral-500 mt-1">{formatDateTime(item.createdAt)}</p>
                {(item.changes?.length ?? 0) > 0 && (
                  <ul className="mt-2 space-y-1">
                    {item.changes?.map((change, index) => (
                      <li key={`${item.id}-${change.field}-${index}`} className="text-xs text-neutral-600">
                        <span className="font-medium">{change.label}:</span> {change.before} {"->"} {change.after}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
