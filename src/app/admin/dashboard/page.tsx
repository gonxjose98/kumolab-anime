'use client';

import { useState, useEffect } from 'react';
import { BlogPost, Product } from '@/types';
import styles from './dashboard.module.css';

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState<'ANALYTICS' | 'POSTS' | 'MERCH'>('ANALYTICS');
    const [posts, setPosts] = useState<BlogPost[]>([]);
    const [products, setProducts] = useState<Product[]>([]);

    // Post Form State
    const [newPost, setNewPost] = useState({
        title: '',
        slug: '',
        type: 'INTEL',
        content: '',
        image: ''
    });

    useEffect(() => {
        fetchPosts();
        // fetchProducts(); // Assume similar API for products exists or reuse mock
    }, []);

    const fetchPosts = async () => {
        const res = await fetch('/api/posts');
        if (res.ok) setPosts(await res.json());
    };

    const handleCreatePost = async (e: React.FormEvent) => {
        e.preventDefault();
        await fetch('/api/posts', {
            method: 'POST',
            body: JSON.stringify({ ...newPost, isPublished: true }),
        });
        setNewPost({ title: '', slug: '', type: 'INTEL', content: '', image: '' });
        fetchPosts();
    };

    const handleDeletePost = async (id: string) => {
        if (confirm('Delete this post?')) {
            await fetch('/api/posts', {
                method: 'DELETE',
                body: JSON.stringify({ id }),
            });
            fetchPosts();
        }
    };

    return (
        <div className={styles.container}>
            <nav className={styles.sidebar}>
                <h2 className={styles.brand}>Kumo Admin</h2>
                <button onClick={() => setActiveTab('ANALYTICS')} className={activeTab === 'ANALYTICS' ? styles.active : ''}>Analytics</button>
                <button onClick={() => setActiveTab('POSTS')} className={activeTab === 'POSTS' ? styles.active : ''}>Content</button>
                <button onClick={() => setActiveTab('MERCH')} className={activeTab === 'MERCH' ? styles.active : ''}>Merch</button>
            </nav>

            <main className={styles.main}>
                {activeTab === 'ANALYTICS' && (
                    <div className={styles.statsGrid}>
                        <div className={styles.statCard}>
                            <h3>Daily Views</h3>
                            <p>12,405</p>
                        </div>
                        <div className={styles.statCard}>
                            <h3>Active Users</h3>
                            <p>842</p>
                        </div>
                        <div className={styles.statCard}>
                            <h3>Merch Clicks</h3>
                            <p>156</p>
                        </div>
                    </div>
                )}

                {activeTab === 'POSTS' && (
                    <div className={styles.contentSection}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                            <h2>Create New Post</h2>
                            <button
                                onClick={async () => {
                                    const simulatedDrop = {
                                        title: `Daily Drops - ${new Date().toLocaleDateString()}`,
                                        slug: `daily-drops-${Date.now()}`,
                                        type: 'DROP',
                                        content: 'Good morning, Kumo Fam.\n\nHere are today’s drops:\n- Simulated Anime 1 — Episode 12\n- Simulated Anime 2 — Episode 5',
                                        image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&q=80&w=1000'
                                    };
                                    await fetch('/api/posts', { method: 'POST', body: JSON.stringify({ ...simulatedDrop, isPublished: true }) });
                                    fetchPosts();
                                }}
                                style={{ background: '#22c55e', color: '#fff', border: 'none', padding: '0.8rem 1.5rem', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Simulate Daily Drop
                            </button>
                        </div>
                        <form onSubmit={handleCreatePost} className={styles.form}>
                            <input
                                placeholder="Title"
                                value={newPost.title}
                                onChange={e => setNewPost({ ...newPost, title: e.target.value })}
                                required
                            />
                            <input
                                placeholder="Slug"
                                value={newPost.slug}
                                onChange={e => setNewPost({ ...newPost, slug: e.target.value })}
                                required
                            />
                            <select
                                value={newPost.type}
                                onChange={e => setNewPost({ ...newPost, type: e.target.value })}
                            >
                                <option value="DROP">DROP</option>
                                <option value="INTEL">INTEL</option>
                                <option value="TRENDING">TRENDING</option>
                                <option value="COMMUNITY">COMMUNITY</option>
                            </select>
                            <input
                                placeholder="Image URL"
                                value={newPost.image}
                                onChange={e => setNewPost({ ...newPost, image: e.target.value })}
                            />
                            <textarea
                                placeholder="Content"
                                value={newPost.content}
                                onChange={e => setNewPost({ ...newPost, content: e.target.value })}
                                rows={5}
                                required
                            />
                            <button type="submit">Publish Post</button>
                        </form>

                        <h2>Recent Posts</h2>
                        <div className={styles.postList}>
                            {posts.map(post => (
                                <div key={post.id} className={styles.postItem}>
                                    <span>{post.title}</span>
                                    <div className={styles.actions}>
                                        <span className={styles.badge}>{post.type}</span>
                                        <button onClick={() => handleDeletePost(post.id)} className={styles.deleteBtn}>Delete</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'MERCH' && (
                    <div>
                        <h2>Merch Management</h2>
                        <p>Feature in progress. Use JSON file to update products.</p>
                    </div>
                )}
            </main>
        </div>
    );
}
