import { API_BASE_URL } from '../config.js';

const API_BASE = API_BASE_URL || '';

async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(options.headers || {}),
        },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data;
}

export function createRoom(name) {
    return request('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
}

export function joinRoom(roomCode, name) {
    return request(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
}

export function getRoomStatus(roomCode, participantId) {
    return request(
        `/api/rooms/${encodeURIComponent(roomCode)}?participantId=${encodeURIComponent(participantId)}`
    );
}

export function markParticipantReady(roomCode, participantId, payload) {
    return request(
        `/api/rooms/${encodeURIComponent(roomCode)}/participants/${encodeURIComponent(participantId)}/ready`,
        {
            method: 'POST',
            body: JSON.stringify(payload),
        }
    );
}
