import { redirect } from 'next/navigation';

export default function StoreIndex() {
    redirect('/admin/store/products');
}
