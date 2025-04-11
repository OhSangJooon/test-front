import { useState } from 'react';
import {
  RSocketClient,
  JsonSerializer,
  IdentitySerializer,
} from 'rsocket-core';
import RSocketWebSocketClient from 'rsocket-websocket-client';
import { Buffer } from 'buffer'; // 반드시 import 필요

function App() {
  const [status, setStatus] = useState('대기 중...');
  const [queue, setQueue] = useState([]);
  const [userId, setUserId] = useState('');

  const connectQueue = () => {
    if (!userId) {
      alert('사용자 ID를 입력해주세요');
      return;
    }

    const client = new RSocketClient({
      transport: new RSocketWebSocketClient({ url: 'ws://localhost:7010/rsocket' }),
      setup: {
        dataMimeType: 'application/json',
        metadataMimeType: 'message/x.rsocket.routing.v0',
        keepAlive: 60000,
        lifetime: 180000,
        payload: {
          data: { userId }, // ✅ 연결 시 보낼 데이터
          metadata: '', // routing X
        }
      },
      serializers: {
        data: JsonSerializer,
        metadata: IdentitySerializer,
      },
    });

    client.connect().subscribe({
      onComplete: socket => {
        setStatus('✅ RSocket 연결 완료');

        const route = "queue.status";
        const metadata = String.fromCharCode(route.length) + route;

        // console.log('🔧 보내는 데이터:', `"${userId}"`);  // data 확인
        // console.log('🔧 보내는 metadata:', metadata);    // metadata 확인

        socket.requestStream({
          data: {userId},
          metadata: metadata,
        }).subscribe({
          onNext: payload => {
            console.log('✅ 받은 상태:', payload.data);
            setQueue(prev => [...prev, payload.data]);
          },
          onError: error => {
            console.error('❌ 스트림 에러:', error);
            setStatus('❌ 스트림 에러');
          },
          onComplete: () => {
            setStatus('🎉 입장 가능! 스트림 종료');
          },
        });
      },
      onError: error => {
        console.error('❌ 연결 실패:', error);
        setStatus('🚫 연결 실패');
      },
    })
  };

  return (
      <div style={{ padding: '2rem' }}>
        <h1>🎯 RSocket 대기열 테스트</h1>

        <div style={{ marginBottom: '1rem' }}>
          <input
              type="text"
              placeholder="사용자 ID 입력"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={{ marginRight: '0.5rem' }}
          />
          <button onClick={connectQueue}>대기열 진입</button>
        </div>

        <p>📡 연결 상태: <strong>{status}</strong></p>
        <hr />

        <ul>
          {queue.map((q, i) => (
              <li key={i}>순번 {q.position} → {q.status}</li>
          ))}
        </ul>
      </div>
  );
}

export default App;