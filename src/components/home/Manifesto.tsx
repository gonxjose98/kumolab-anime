'use client';
import { useState } from 'react';
import styles from './Manifesto.module.css';

const Manifesto = () => {
    const [email, setEmail] = useState('');
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [message, setMessage] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('Submitting email:', email);
        setStatus('loading');
        setMessage('');

        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });

            const data = await res.json();
            console.log('Subscription response:', res.status, data);

            if (res.ok) {
                setStatus('success');
                setMessage('Welcome to the inner circle. Check your inbox.');
                setEmail('');
            } else {
                setStatus('error');
                setMessage(data.error || 'Something went wrong.');
            }
        } catch (error) {
            console.error('Subscription error:', error);
            setStatus('error');
            setMessage('Failed to subscribe. Please try again.');
        }
    };

    return (
        <section className={styles.container}>
            <div className={styles.content}>
                <h2 className={styles.heading}>What KumoLab Is</h2>
                <div className={styles.textBlock}>
                    <p>We track what matters.</p>
                    <p>We ignore what doesn’t.</p>
                    <p>A daily feed of real anime updates, without the noise.</p>
                </div>

                <div className={styles.emailCapture}>
                    <p className={styles.emailText}>Get the latest anime updates before everyone else.</p>

                    {status === 'success' ? (
                        <div className={styles.successMessage}>
                            <p>{message}</p>
                        </div>
                    ) : (
                        <form className={styles.form} onSubmit={handleSubmit}>
                            <input
                                type="email"
                                placeholder="Enter your email"
                                className={styles.input}
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={status === 'loading'}
                            />
                            <button
                                type="submit"
                                className={styles.submitBtn}
                                disabled={status === 'loading'}
                            >
                                {status === 'loading' ? 'Joining...' : 'Subscribe'}
                            </button>
                        </form>
                    )}
                    {status === 'error' && <p className={styles.errorMessage}>{message}</p>}
                </div>
            </div>
        </section>
    );
};

export default Manifesto;
