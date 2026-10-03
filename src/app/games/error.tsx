"use client";
export default function GamesError({reset}:{reset:()=>void}){return <main><h1>Hộp trò chơi chưa mở được.</h1><p>Có một lỗi khi tải màn này. Bạn có thể thử lại.</p><button onClick={reset}>Thử lại</button><a href="/house">Về Nhà</a></main>;}
