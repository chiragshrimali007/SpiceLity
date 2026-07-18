-- Raw SQL DDL to build the production-ready chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  message_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_read BOOLEAN DEFAULT FALSE,
  
  -- Optimized indexes for fast message history retrieval and sorting
  INDEX idx_sender_receiver (sender_id, receiver_id),
  INDEX idx_receiver_sender (receiver_id, sender_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
