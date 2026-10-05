export type Role = "user" | "admin";
export type Profile = { id:string; email:string|null; username:string|null; avatar_url:string|null; role:Role; created_at:string };
export type Order = { id:string; user_id:string; product:string; price:number; note:string|null; status:"Pending"|"Diproses"|"Selesai"; product_key:string|null; variant:string|null; qty:number|null; unit_price:number|null; created_at:string };
export type Message = { id:string; user_id:string; sender:"user"|"admin"; message:string; is_read:boolean; hidden_for_admin:boolean; attachment_url:string|null; attachment_type:"image"|"video"|null; created_at:string };
export type Review = { id:string; order_id:string; user_id:string; product_key:string; rating:number; comment:string|null; username:string; variant:string|null; created_at:string; updated_at:string };
export type CatalogGroup = { product_key:string; name:string; description:string; archived:boolean; archived_at:string|null; updated_at:string };
export type CatalogVariant = { product_key:string; variant_id:string; order_name:string; label:string; price:number; active:boolean; sort:number; archived:boolean; archived_at:string|null; updated_at:string };
