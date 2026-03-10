import { useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { createContact, listContacts, type ContactRecord } from "../lib/data";

export function ProductCrmPage() {
  const { productId = "" } = useParams();
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("lead");
  const [status, setStatus] = useState("new");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [notes, setNotes] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    if (!productId) return;
    setContacts(await listContacts(productId));
  };

  useEffect(() => { void load(); }, [productId]);

  const onCreate = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!name.trim() || !productId || busy) return;
    try {
      setBusy(true);
      setError("");
      await createContact({
        productId,
        name: name.trim(),
        kind,
        status,
        company: company.trim(),
        title: title.trim(),
        email: email.trim(),
        phone: phone.trim(),
        linkedin: linkedin.trim(),
        notes: notes.trim(),
      });
      setName("");
      setCompany("");
      setTitle("");
      setEmail("");
      setPhone("");
      setLinkedin("");
      setNotes("");
      setShowCreateForm(false);
      await load();
    } catch (nextError) {
      setError((nextError as Error)?.message || "Failed to create contact");
      console.error("Failed to create contact", nextError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 lg:p-6 border-b border-neutral-200 bg-white shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">CRM</h1>
          <button
            className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm"
            onClick={() => setShowCreateForm((current) => !current)}
          >
            {showCreateForm ? "Close new contact" : "New contact"}
          </button>
        </div>
        {showCreateForm && (
          <form className="space-y-2" onSubmit={(event) => void onCreate(event)}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Contact name" value={name} onChange={(e) => setName(e.target.value)} />
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} />
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Title / role" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <input className="border border-neutral-300 rounded-lg px-3 py-2" placeholder="LinkedIn URL" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
              <select className="border border-neutral-300 rounded-lg px-3 py-2" value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="lead">lead</option><option value="customer">customer</option><option value="partner">partner</option><option value="investor">investor</option><option value="vendor">vendor</option><option value="other">other</option>
              </select>
              <select className="border border-neutral-300 rounded-lg px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="new">new</option><option value="contacted">contacted</option><option value="interested">interested</option><option value="follow_up">follow_up</option><option value="customer">customer</option><option value="inactive">inactive</option>
              </select>
            </div>
            <textarea className="w-full border border-neutral-300 rounded-lg px-3 py-2 min-h-[90px]" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-60" disabled={busy || !name.trim()}>
              {busy ? "Adding..." : "Add"}
            </button>
          </form>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 pb-20 lg:pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {contacts.map((contact) => (
            <Link key={contact.id} to={`/products/${productId}/crm/${contact.id}`} className="bg-white border border-neutral-200 rounded-lg p-4 hover:shadow-sm">
              <h3 className="font-semibold">{contact.name}</h3>
              <p className="text-sm text-neutral-600 capitalize">{contact.status}</p>
              {contact.company ? <p className="text-sm text-neutral-500 mt-1">{contact.company}</p> : null}
              {contact.email ? <p className="text-sm text-neutral-500 mt-1">{contact.email}</p> : null}
              {contact.phone ? <p className="text-sm text-neutral-500">{contact.phone}</p> : null}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
