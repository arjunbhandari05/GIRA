import { useRef, useState } from 'react';

export default function FileDropZone({ onFile }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = file => {
    if (file) onFile(file);
  };

  return (
    <div
      className={`dropzone ${dragging ? 'dragging' : ''}`}
      onDragOver={event => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        handleFile(event.dataTransfer.files?.[0]);
      }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
    >
      <strong>Upload 23andMe file</strong>
      <span>Drop raw .txt here or click to choose</span>
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={event => handleFile(event.target.files?.[0])}
      />
    </div>
  );
}
