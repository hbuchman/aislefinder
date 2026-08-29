import React, { useState, useRef, useEffect } from 'react';
import { sendChatMessage } from '../api';
import { buildChatContext } from '../listsStore';

const ChatScreen = ({ currentList, completedLists, onBack }) => {
  const [messages, setMessages] = useState([]); // [{role: 'user'|'assistant', content}]
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setError('');
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setSending(true);
    try {
      const context = buildChatContext(currentList, completedLists);
      const reply = await sendChatMessage({ message: text, history, context });
      setMessages((prev) => [...prev, { role: 'assistant', content: reply || "I didn't quite catch that." }]);
    } catch (err) {
      setError(err.message || "Couldn't get a reply — try again");
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px 4px' }}>
        <button className="af-backbtn" onClick={onBack}>
          <i className="fa-solid fa-chevron-left" style={{ marginRight: '5px', fontSize: '12px' }} />
          Back
        </button>
        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Ask AisleFinder</h2>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--af-text-faint)' }}>
            <i className="fa-solid fa-comment-dots" style={{ fontSize: '32px', marginBottom: '12px', display: 'block' }} />
            <p style={{ fontSize: '14px', margin: '0 0 4px', lineHeight: 1.5 }}>
              Ask about your list, past purchases, or shopping tips.
            </p>
            <p style={{ fontSize: '12px', margin: 0, lineHeight: 1.5 }}>
              "Do I need wheat flour?" · "How do I pick a good cactus leaf?"
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
              margin: '6px 0',
            }}
          >
            <div style={{
              maxWidth: '80%',
              padding: '10px 14px',
              borderRadius: '14px',
              fontSize: '14px',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              background: m.role === 'user' ? 'var(--af-green)' : 'var(--af-inset-bg)',
              color: m.role === 'user' ? 'white' : 'var(--af-text)',
              border: m.role === 'user' ? 'none' : '1px solid var(--af-border)',
            }}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', margin: '6px 0' }}>
            <div style={{
              padding: '10px 14px',
              borderRadius: '14px',
              background: 'var(--af-inset-bg)',
              border: '1px solid var(--af-border)',
              color: 'var(--af-text-muted)',
              fontSize: '14px',
            }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }} />
              Thinking…
            </div>
          </div>
        )}
        {error && (
          <div style={{
            fontSize: '13px',
            color: 'var(--af-error-text)',
            background: 'var(--af-error-bg)',
            border: '1px solid var(--af-error-border)',
            borderRadius: '10px',
            padding: '10px 12px',
            margin: '6px 0',
          }}>
            {error}
          </div>
        )}
      </div>

      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '10px 16px calc(14px + var(--safe-area-inset-bottom))',
        borderTop: '1px solid var(--af-border)',
        background: 'var(--af-bg)',
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
          placeholder="Ask a question…"
          className="af-input"
          disabled={sending}
          style={{
            flex: 1,
            padding: '12px 14px',
            border: '2px solid var(--af-input-border)',
            borderRadius: '10px',
            backgroundColor: 'var(--af-inset-bg)',
            color: 'var(--af-text)',
            outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <button
          onClick={handleSend}
          className="af-btn"
          title="Send"
          disabled={sending || !input.trim()}
          style={{ width: '46px', fontSize: '18px', borderRadius: '10px', padding: 0 }}
        >
          <i className="fa-solid fa-paper-plane" />
        </button>
      </div>
    </div>
  );
};

export default ChatScreen;
