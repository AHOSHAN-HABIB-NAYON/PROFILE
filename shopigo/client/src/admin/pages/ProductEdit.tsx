import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ExternalLink, Plus, Save, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { img } from '../../lib/image';
import { Button, Field, Input, PageSpinner, Select, Switch, Textarea, toast, useConfirm } from '../../components/ui';
import { ImageUploader, PageHeader, Panel, SingleImage, useCan, type UploadedImage } from '../components/kit';
import { RichText } from '../components/RichText';

interface VariantForm { id?: number; sku: string; size: string; color: string; color_hex: string; price: string; sale_price: string; stock: string; is_active: boolean }
interface Form {
  name: string; slug: string; sku: string; category_id: string; subcategory_id: string; brand_id: string; price: string; sale_price: string; cost_price: string; stock: string; low_stock_threshold: string; weight: string;
  short_description: string; description: string; specifications: Array<{ label: string; value: string }>; status: string;
  is_featured: boolean; is_flash_sale: boolean; is_combo: boolean; free_delivery: boolean; cod_available: boolean; size_required: boolean;
  seo_title: string; seo_description: string; seo_keywords: string; meta_image: string | null; social_image: string | null; images: UploadedImage[]; variants: VariantForm[];
}

const EMPTY: Form = {
  name: '', slug: '', sku: '', category_id: '', subcategory_id: '', brand_id: '', price: '', sale_price: '', cost_price: '', stock: '0', low_stock_threshold: '10', weight: '',
  short_description: '', description: '', specifications: [], status: 'active', is_featured: false, is_flash_sale: false, is_combo: false, free_delivery: false, cod_available: true, size_required: false,
  seo_title: '', seo_description: '', seo_keywords: '', meta_image: null, social_image: null, images: [], variants: [],
};

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const can = useCan();
  const { confirm, dialog } = useConfirm();
  const [f, setF] = useState<Form>(EMPTY);
  const existing = useQuery({ queryKey: ['admin-product', id], queryFn: () => api.get<Record<string, any>>(`/api/admin/products/${id}`), enabled: !isNew });
  const cats = useQuery({ queryKey: ['admin-categories'], queryFn: () => api.get<Array<{ id: number; name: string; parent_id: number | null }>>('/api/admin/catalog/categories') });
  const brands = useQuery({ queryKey: ['admin-brands'], queryFn: () => api.get<Array<{ id: number; name: string }>>('/api/admin/catalog/brands') });

  useEffect(() => {
    const p = existing.data;
    if (!p) return;
    setF({
      name: p.name, slug: p.slug, sku: s(p.sku), category_id: s(p.category_id), subcategory_id: s(p.subcategory_id), brand_id: s(p.brand_id), price: s(p.price), sale_price: s(p.sale_price), cost_price: s(p.cost_price),
      stock: s(p.stock), low_stock_threshold: s(p.low_stock_threshold), weight: s(p.weight), short_description: s(p.short_description), description: s(p.description), specifications: p.specifications ?? [],
      status: p.status, is_featured: Boolean(p.is_featured), is_flash_sale: Boolean(p.is_flash_sale), is_combo: Boolean(p.is_combo), free_delivery: Boolean(p.free_delivery), cod_available: Boolean(p.cod_available), size_required: Boolean(p.size_required),
      seo_title: s(p.seo_title), seo_description: s(p.seo_description), seo_keywords: s(p.seo_keywords), meta_image: p.meta_image, social_image: p.social_image,
      images: (p.images ?? []).map((i: any) => ({ id: i.id, path: i.path, width: i.width, height: i.height, alt: i.alt })),
      variants: (p.variants ?? []).map((v: any) => ({ id: v.id, sku: s(v.sku), size: s(v.size), color: s(v.color), color_hex: s(v.color_hex), price: s(v.price), sale_price: s(v.sale_price), stock: s(v.stock), is_active: Boolean(v.is_active) })),
    });
  }, [existing.data]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...f, slug: f.slug || null, sku: f.sku || null, category_id: f.category_id ? Number(f.category_id) : null, subcategory_id: f.subcategory_id ? Number(f.subcategory_id) : null, brand_id: f.brand_id ? Number(f.brand_id) : null,
        price: Number(f.price), sale_price: f.sale_price, cost_price: f.cost_price, stock: Number(f.stock || 0), low_stock_threshold: Number(f.low_stock_threshold || 0), weight: f.weight,
        specifications: f.specifications.filter((x) => x.label && x.value), size_required: f.variants.some((v) => v.size) ? true : f.size_required,
        images: f.images.map((i) => ({ path: i.path, alt: i.alt ?? null, width: i.width ?? null, height: i.height ?? null })),
        variants: f.variants.map((v) => ({ ...v, stock: Number(v.stock || 0), color_hex: v.color_hex || null, sku: v.sku || null, size: v.size || null, color: v.color || null })),
      };
      return isNew ? api.post<{ id: number }>('/api/admin/products', body) : api.put<{ id: number }>(`/api/admin/products/${id}`, body);
    },
    onSuccess: (r) => {
      toast.success('Product saved');
      void qc.invalidateQueries({ queryKey: ['admin-products'] });
      void qc.invalidateQueries({ queryKey: ['admin-product', String(r.id)] });
      if (isNew) navigate(`/admin/products/${r.id}`, { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({ mutationFn: () => api.del(`/api/admin/products/${id}`), onSuccess: () => { toast.success('Moved to trash'); navigate('/admin/products'); } });

  if (!isNew && existing.isLoading) return <PageSpinner />;
  const roots = cats.data?.filter((c) => !c.parent_id) ?? [];
  const subs = cats.data?.filter((c) => c.parent_id && String(c.parent_id) === f.category_id) ?? [];
  const disabled = !can('products.manage');
  const margin = Number(f.cost_price) > 0 ? Math.round((((Number(f.sale_price) || Number(f.price)) - Number(f.cost_price)) / (Number(f.sale_price) || Number(f.price))) * 100) : null;
  const addVariant = () => set('variants', [...f.variants, { sku: '', size: '', color: '', color_hex: '', price: '', sale_price: '', stock: '0', is_active: true }]);
  const addSizes = (list: string) => set('variants', [...f.variants, ...list.split(',').map((x) => x.trim()).filter(Boolean).map((size) => ({ sku: '', size, color: '', color_hex: '', price: '', sale_price: '', stock: '0', is_active: true }))]);

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <PageHeader
        back={<Link to="/admin/products" className="mb-1 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-brand-600"><ArrowLeft className="size-4" />Products</Link>}
        title={isNew ? 'Add product' : f.name || 'Edit product'}
        actions={
          <>
            {!isNew && <a href={`/product/${f.slug}`} target="_blank" rel="noopener noreferrer"><Button type="button" size="sm" variant="ghost" icon={<ExternalLink className="size-4" />}>View</Button></a>}
            {!isNew && !disabled && <Button type="button" size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={async () => { if (await confirm('Move product to trash?', { danger: true })) del.mutate(); }}>Delete</Button>}
            {!disabled && <Button loading={save.isPending} icon={<Save className="size-4" />}>Save</Button>}
          </>
        }
      />
      <fieldset disabled={disabled} className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-4">
          <Panel title="Basic information">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Product name" required className="sm:col-span-2"><Input value={f.name} onChange={(e) => set('name', e.target.value)} required maxLength={255} /></Field>
              <Field label="Slug" hint="Leave empty to generate from the name"><Input value={f.slug} onChange={(e) => set('slug', e.target.value)} placeholder="auto" /></Field>
              <Field label="SKU"><Input value={f.sku} onChange={(e) => set('sku', e.target.value)} /></Field>
              <Field label="Short description" className="sm:col-span-2"><Textarea rows={2} className="min-h-[70px]" value={f.short_description} onChange={(e) => set('short_description', e.target.value)} maxLength={1000} /></Field>
            </div>
            <div className="mt-4"><span className="label">Full description</span><RichText value={f.description} onChange={(v) => set('description', v)} /></div>
          </Panel>

          <Panel title="Images" actions={<span className="text-[12px] text-muted">Drag to reorder · first image is the main image · auto-compressed to AVIF/WebP</span>}>
            <ImageUploader value={f.images} onChange={(v) => set('images', v)} folder="products" />
          </Panel>

          <Panel title="Variants (size / colour)" actions={<div className="flex gap-2"><Button type="button" size="sm" variant="ghost" onClick={() => { const v = prompt('Sizes, comma separated (e.g. S,M,L,XL or 39,40,41,42)'); if (v) addSizes(v); }}>Quick sizes</Button><Button type="button" size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={addVariant}>Add variant</Button></div>}>
            {f.variants.length === 0 ? <p className="text-[13px] text-muted">No variants. Add sizes or colours if customers need to choose one — when a product has sizes, customers must pick a size before ordering.</p> : (
              <div className="space-y-2">
                <div className="hidden grid-cols-[1fr_1fr_90px_1fr_1fr_80px_32px] gap-2 px-1 text-[11.5px] font-semibold text-muted md:grid"><span>Size</span><span>Colour</span><span>Hex</span><span>Price</span><span>Sale price</span><span>Stock</span><span /></div>
                {f.variants.map((v, i) => {
                  const upd = (patch: Partial<VariantForm>) => set('variants', f.variants.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                  return (
                    <div key={i} className="grid grid-cols-2 gap-2 rounded-2xl bg-soft p-2 md:grid-cols-[1fr_1fr_90px_1fr_1fr_80px_32px] md:bg-transparent md:p-0">
                      <Input className="!h-10 !py-0" placeholder="Size" value={v.size} onChange={(e) => upd({ size: e.target.value })} />
                      <Input className="!h-10 !py-0" placeholder="Colour" value={v.color} onChange={(e) => upd({ color: e.target.value })} />
                      <input type="color" className="h-10 w-full cursor-pointer rounded-xl border border-line bg-surface p-1" value={v.color_hex || '#ffffff'} onChange={(e) => upd({ color_hex: e.target.value })} aria-label="Colour" />
                      <Input className="!h-10 !py-0" type="number" min={0} placeholder="= product" value={v.price} onChange={(e) => upd({ price: e.target.value })} />
                      <Input className="!h-10 !py-0" type="number" min={0} placeholder="—" value={v.sale_price} onChange={(e) => upd({ sale_price: e.target.value })} />
                      <Input className="!h-10 !py-0" type="number" min={0} value={v.stock} onChange={(e) => upd({ stock: e.target.value })} />
                      <button type="button" onClick={() => set('variants', f.variants.filter((_, j) => j !== i))} className="grid size-10 place-items-center rounded-xl text-danger hover:bg-red-50" aria-label="Remove"><Trash2 className="size-4" /></button>
                    </div>
                  );
                })}
                <p className="text-[12px] text-muted">Total stock is calculated from active variants ({f.variants.filter((v) => v.is_active).reduce((a, v) => a + Number(v.stock || 0), 0)}).</p>
              </div>
            )}
          </Panel>

          <Panel title="Specifications" actions={<Button type="button" size="sm" variant="soft" icon={<Plus className="size-4" />} onClick={() => set('specifications', [...f.specifications, { label: '', value: '' }])}>Add row</Button>}>
            {f.specifications.length === 0 && <p className="text-[13px] text-muted">e.g. Battery → 30 hours, Warranty → 6 months</p>}
            <div className="space-y-2">
              {f.specifications.map((sp, i) => (
                <div key={i} className="grid grid-cols-[1fr_1.5fr_40px] gap-2">
                  <Input className="!h-10 !py-0" placeholder="Label" value={sp.label} onChange={(e) => set('specifications', f.specifications.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                  <Input className="!h-10 !py-0" placeholder="Value" value={sp.value} onChange={(e) => set('specifications', f.specifications.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <button type="button" onClick={() => set('specifications', f.specifications.filter((_, j) => j !== i))} className="grid size-10 place-items-center rounded-xl text-danger hover:bg-red-50" aria-label="Remove"><Trash2 className="size-4" /></button>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="SEO & social sharing">
            <div className="grid gap-4">
              <Field label="SEO title" hint={`${f.seo_title.length}/60 recommended`}><Input value={f.seo_title} onChange={(e) => set('seo_title', e.target.value)} placeholder={f.name} maxLength={255} /></Field>
              <Field label="SEO description" hint={`${f.seo_description.length}/160 recommended`}><Textarea rows={2} className="min-h-[70px]" value={f.seo_description} onChange={(e) => set('seo_description', e.target.value)} maxLength={500} /></Field>
              <Field label="SEO keywords"><Input value={f.seo_keywords} onChange={(e) => set('seo_keywords', e.target.value)} placeholder="comma, separated" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Meta image"><SingleImage value={f.meta_image} onChange={(v) => set('meta_image', v)} folder="products" /></Field>
                <Field label="Social share image (OG)"><SingleImage value={f.social_image} onChange={(v) => set('social_image', v)} folder="products" /></Field>
              </div>
              <div className="rounded-2xl border border-line p-4">
                <p className="text-[12px] text-muted">Search preview</p>
                <p className="truncate text-[16px] text-[#1a0dab]">{f.seo_title || f.name || 'Product title'}</p>
                <p className="text-[12.5px] text-green-800">{location.origin}/product/{f.slug || 'product-slug'}</p>
                <p className="line-clamp-2 text-[13px] text-ink-2">{f.seo_description || f.short_description || 'Description…'}</p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Status">
            <Select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="active">Active (visible)</option><option value="draft">Draft (hidden)</option><option value="archived">Archived</option></Select>
            <div className="mt-4 space-y-3.5">
              <Switch checked={f.is_featured} onChange={(v) => set('is_featured', v)} label="Featured" />
              <Switch checked={f.free_delivery} onChange={(v) => set('free_delivery', v)} label="Free delivery" />
              <Switch checked={f.cod_available} onChange={(v) => set('cod_available', v)} label="Cash on Delivery available" />
              <Switch checked={f.is_flash_sale} onChange={(v) => set('is_flash_sale', v)} label="Flash sale item" description="Set prices under Marketing → Flash Sales" />
              <Switch checked={f.is_combo} onChange={(v) => set('is_combo', v)} label="Part of combos" />
              {f.variants.length === 0 && <Switch checked={f.size_required} onChange={(v) => set('size_required', v)} label="Size required" />}
            </div>
          </Panel>
          <Panel title="Pricing">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (৳)" required><Input type="number" min={0} step="0.01" value={f.price} onChange={(e) => set('price', e.target.value)} required /></Field>
              <Field label="Sale price (৳)"><Input type="number" min={0} step="0.01" value={f.sale_price} onChange={(e) => set('sale_price', e.target.value)} /></Field>
              <Field label="Cost price (৳)" hint={margin !== null ? `Margin ${margin}%` : 'Private — for profit reports'}><Input type="number" min={0} step="0.01" value={f.cost_price} onChange={(e) => set('cost_price', e.target.value)} /></Field>
              <Field label="Weight (kg)"><Input type="number" min={0} step="0.01" value={f.weight} onChange={(e) => set('weight', e.target.value)} /></Field>
            </div>
          </Panel>
          <Panel title="Inventory">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Stock" hint={f.variants.length ? 'Managed by variants' : undefined}><Input type="number" min={0} value={f.stock} onChange={(e) => set('stock', e.target.value)} disabled={f.variants.length > 0} /></Field>
              <Field label="Low stock alert at"><Input type="number" min={0} value={f.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} /></Field>
            </div>
          </Panel>
          <Panel title="Organisation">
            <div className="space-y-3">
              <Field label="Category"><Select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value, subcategory_id: '' })}><option value="">— None —</option>{roots.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
              {subs.length > 0 && <Field label="Subcategory"><Select value={f.subcategory_id} onChange={(e) => set('subcategory_id', e.target.value)}><option value="">— None —</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
              <Field label="Brand"><Select value={f.brand_id} onChange={(e) => set('brand_id', e.target.value)}><option value="">— None —</option>{brands.data?.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</Select></Field>
            </div>
          </Panel>
          {f.images[0] && <img src={img(f.images[0].path, 'md')} alt="" className="card hidden aspect-square w-full object-cover xl:block" />}
        </div>
      </fieldset>
      {dialog}
    </form>
  );
}
