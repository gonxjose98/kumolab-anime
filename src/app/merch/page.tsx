import { getVisibleProducts } from '@/lib/merch';
import styles from './merch.module.css';

export const dynamic = 'force-dynamic';

export default async function MerchPage() {
    const products = await getVisibleProducts();

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>The Collection</h1>
                <p className={styles.subtitle}>Curated artifacts for the discerning collector.</p>
                {/* <div className={styles.headerActions}>
                    <a href="https://kumolab-originals.printful.me" target="_blank" rel="noopener noreferrer" className={styles.storeLink}>
                        Visit Official Store
                    </a>
                </div> */}
            </header>

            <div className={styles.grid}>
                {products.map((product) => (
                    <a href={product.link} key={product.id} className={styles.card} target="_blank" rel="noopener noreferrer">
                        <div className={styles.imageWrapper}>
                            <img src={product.image} alt={product.name} className={styles.image} />
                        </div>
                        <div className={styles.info}>
                            <h3 className={styles.name}>{product.name}</h3>
                            <span className={styles.price}>${product.price.toFixed(2)}</span>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    );
}
