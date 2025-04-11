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
        const metadata1 = String.fromCharCode(route.length);

        let metadata = metadata1.concat(route);

        // console.log('🔧 보내는 데이터:', `"${userId}"`);  // data 확인
        // console.log('🔧 보내는 metadata:', metadata);    // metadata 확인

        socket.requestStream({
          data: {userId},
          metadata: metadata,
        }).subscribe({
          onSubscribe: sub => {
            console.log('🔗 스트림 구독 시작', sub);
            sub.request(2147483646); // 요청 수를 무한대로 설정
          },
          onNext: payload => {
            console.log('✅ 받은 상태:', payload.data);
            setQueue(prev => [...prev, payload.data]);
          },
          onError: error => {
            console.error('❌ 스트림 에러:', error);
            setStatus('❌ 스트림 에러');
            socket.close();
          },
          onComplete: () => {
            setStatus('🎉 입장 가능! 스트림 종료');
            socket.close();
          },
        });
      },
      onError: error => {
        console.error('❌ 연결 실패:', error);
        setStatus('🚫 연결 실패');
      },
    })
  };

  function exitQueue() {
    // RSocket 클라이언트 생성
    const client = new RSocketClient({
      setup: {
        dataMimeType: 'application/json',
        metadataMimeType: 'message/x.rsocket.routing.v0',
        keepAlive: 60000,
        lifetime: 180000,
        // 연결 시 payload 설정은 선택사항
        // payload: { data: { userId: "user123" }, metadata: '' },
      },
      transport: new RSocketWebSocketClient({ url: 'ws://localhost:7010/rsocket' }),
      serializers: {
        data: JsonSerializer,       // 요청 데이터 객체를 JSON으로 직렬화
        metadata: IdentitySerializer, // metadata는 그대로 전송
      }
    });

    // RSocket 연결
    client.connect().subscribe({
      onComplete: socket => {
        console.log('✅ RSocket 연결 완료');

        // "queue.exit" 라우트를 위한 metadata 생성
        const route = "queue.exit";
        const metadata = String.fromCharCode(route.length) + route;

        // requestResponse 호출
        socket.requestResponse({
          data: { userId: "user123" }, // 퇴장 요청에 전달할 사용자 ID
          metadata: metadata,
        }).subscribe({
          // onSubscribe: sub => {
          //   // 단일 응답이므로 구독 요청은 보통 1 또는 큰 숫자로 설정
          //   console.log('🔗 스트림 구독 시작', sub);
          //   sub.request(1);
          // },
          onNext: payload => {
            console.log("✅ 퇴장 응답:", payload.data);
          },
          onError: error => {
            console.error("❌ 퇴장 처리 에러:", error);
          },
          onComplete: () => {
            console.log("🎉 퇴장 요청 완료");
            // 필요 시 연결 종료
            socket.close();
          }
        });
      },
      onError: error => {
        console.error("❌ RSocket 연결 실패:", error);
      }
    });
  }


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
          <button onClick={exitQueue}>대기열 나가기</button>
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