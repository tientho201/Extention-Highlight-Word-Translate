# 🌐 Highlight Word Translate

> **Extension dịch thuật văn bản bôi đen & OCR chụp màn hình siêu tốc dành cho Google Chrome (Manifest V3).**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension%20MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![JavaScript](https://img.shields.io/badge/Language-Vanilla%20JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![CSS3](https://img.shields.io/badge/Style-Catppuccin%20Mocha-89B4FA?logo=css3&logoColor=white)](https://github.com/catppuccin/catppuccin)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ Tính năng nổi bật

### 1. 🎯 2 Chế độ dịch văn bản bôi đen (Chỉ bật 1 trong 2):
* **Tự động dịch (Auto Translate)**: Khi bôi đen văn bản $\rightarrow$ vừa thả chuột là popup dịch xuất hiện tức thì ngay cạnh con trỏ chuột.
* **Dịch theo phím tắt (Shortcut Translate)**: Khi bôi đen chữ sẽ **không** tự hiện popup (tránh gây phiền khi đang đọc tài liệu). Chỉ khi bạn nhấn phím tắt (ví dụ: `Alt+T`, `Ctrl+Alt`, `Ctrl+Win`...) thì popup dịch mới xuất hiện ngay dưới đoạn văn bản được chọn.
* **Tắt cả 2**: Vô hiệu hóa tính năng dịch bôi đen khi không cần dùng.

### 2. ⌨️ Tùy chỉnh phím tắt toàn diện cho cả 3 tính năng:
* **Hỗ trợ gán phím độc lập cho 3 tính năng**:
  1. **Dịch văn bản bôi đen** *(Mặc định: `Alt+T` / `Option+T`)*.
  2. **Screen OCR Overlay** *(Mặc định: `Ctrl+Shift+X` / `Cmd+Shift+X`)*.
  3. **Screenshot OCR Full Tab** *(Mặc định: `Alt+Shift+S` / `Option+Shift+S`)*.
* **Hỗ trợ phím bổ trợ thuần túy (Không cần phím chữ)**: `Ctrl+Alt`, `Ctrl+Win`, `Alt+Shift`, `Ctrl+Shift`, `Control+Option`...
* **🛡️ Cơ chế chống trùng phím thông minh (Anti-Conflict)**: Tự động phát hiện nếu bạn đặt phím tắt trùng nhau giữa các tính năng $\rightarrow$ lập tức báo dòng đỏ cảnh báo và khôi phục về phím mặc định an toàn.
* **Tự động nhận diện macOS**: Tự động chuyển đổi giao diện và ký hiệu chuẩn giữa **Windows** (`Ctrl`, `Alt`, `Win`) và **macOS / MacBook** (`Control ⌃`, `Option ⌥`, `Cmd ⌘`, `Shift ⇧`).
* **Nút gợi ý nhanh 1-Click**: Có sẵn 4 phím tắt phổ biến trong Popup để chọn nhanh chỉ với 1 click.

### 3. 📸 2 Công cụ OCR chụp màn hình & Dịch ảnh siêu tốc:
* **Screen OCR Overlay**: Kéo chọn trực tiếp vùng màn hình ngay trên trang web đang xem $\rightarrow$ tự động nhận diện chữ (OCR) và dịch tức thì.
* **Screenshot OCR Full Tab**: Mở tab chụp toàn màn hình độ phân giải cao, hỗ trợ vẽ crop box tùy chỉnh và bộ lọc ảnh sắc nét để nhận diện chính xác nhất.
* **⚡ Nút kích hoạt 1-Click từ Popup**: Bạn có thể bấm trực tiếp nút **"⚡ Bật ngay"** hoặc **"⚡ Chụp ngay"** trong Popup để quét OCR mà không bắt buộc phải nhớ phím tắt.
* **Tối ưu hóa Retina Display**: Tự động nhận diện tỷ lệ điểm ảnh vật lý (2x/3x DPR) trên MacBook Air, MacBook Pro để cắt ảnh siêu sắc nét và nhận diện chữ chính xác tuyệt đối.

### 4. 📚 Từ điển thông minh & Tra từ chi tiết:
* **Tra từ đơn**: Tự động hiển thị phiên âm chuẩn (Pinyin / Phonetic), loại từ (*Noun, Verb, Adjective...*), và danh sách tất cả các nét nghĩa chi tiết.
* **Dịch câu / đoạn văn**: Nhận diện thông minh ngữ cảnh, dịch mượt mà với hơn **15+ ngôn ngữ phổ biến** (*Tiếng Việt, Tiếng Anh, Tiếng Trung, Tiếng Nhật, Tiếng Hàn, Tiếng Pháp, Tiếng Đức...*).

### 5. 🔑 Cấu hình OCR API Key riêng (Bảo mật & Không lo nghẽn Quota):
* Người dùng cần tự điền **OCR.space API Key** của riêng mình trong Popup (có link đăng ký nhận key).
* API key không được đóng gói cứng trong extension; extension chỉ đọc key đã lưu trong `chrome.storage.local` của người dùng.
* Hạn mức OCR phụ thuộc chính sách hiện hành của OCR.space; extension không tự cung cấp key dùng chung.

### 6. 🎨 Trải nghiệm giao diện cao cấp (Catppuccin Mocha Dark Theme):
* Popup dịch có thể **kéo thả di chuyển (Draggable)** tự do trên trang web.
* Nút **sao chép nhanh (1-Click Copy)** kết quả dịch.
* **Cache 2 tầng siêu tốc (L1 Page Memory + L2 Service Worker Cache)**: Phản hồi kết quả gần như tức thì (< 5ms) đối với các từ đã tra cứu.

---

## ⌨️ Bảng phím tắt mặc định

| Tính năng | Windows / Linux | macOS / MacBook | Kích hoạt 1-Click | Mô tả |
| :--- | :---: | :---: | :---: | :--- |
| **Dịch chữ bôi đen** *(Khi bật mode Phím tắt)* | `Alt + T` *(hoặc `Ctrl + Alt`)* | `Option ⌥ + T` *(hoặc `Control ⌃ + Option ⌥`)* | — | Bôi đen chữ rồi nhấn phím để hiện popup dịch |
| **Screen OCR Overlay** | `Ctrl + Shift + X` | `Cmd ⌘ + Shift ⇧ + X` | Nút **"⚡ Bật ngay"** | Bật lớp phủ overlay để quét chữ trên ảnh/video |
| **Screenshot OCR Full Tab** | `Alt + Shift + S` | `Option ⌥ + Shift ⇧ + S` | Nút **"⚡ Chụp ngay"** | Mở tab chụp full màn hình để crop & dịch |
| **Đóng Popup / Hủy OCR** | `Escape` | `Escape` | Nút **"✕"** | Tắt nhanh popup hoặc thoát chế độ OCR |

---

## 🚀 Hướng dẫn cài đặt (Installation)

1. **Tải mã nguồn về máy**:
   ```bash
   git clone https://github.com/tientho201/Highlight-Word-Translate.git
   ```
   *(hoặc tải file ZIP về và giải nén ra một thư mục)*.

2. **Cài đặt vào Google Chrome**:
   * Mở Google Chrome và truy cập vào đường dẫn: `chrome://extensions/`
   * Bật công tắc **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải.
   * Bấm vào nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
   * Chọn thư mục `Highlight-Word-Translate` vừa tải về.

3. **Ghim và sử dụng**:
   * Bấm vào biểu tượng mảnh ghép 🧩 trên thanh công cụ của Chrome $\rightarrow$ Ghim extension **Highlight Word Translate** để mở menu cài đặt bất kỳ lúc nào!

4. **Nếu dùng MacBook và OCR không chụp được màn hình**:
   * Mở **System Settings $\rightarrow$ Privacy & Security $\rightarrow$ Screen & System Audio Recording**.
   * Bật quyền cho **Google Chrome**, sau đó thoát hẳn Chrome và mở lại.
   * Có thể kiểm tra hoặc gán lại phím tắt tại `chrome://extensions/shortcuts`.

---

## 🔑 Hướng dẫn lấy OCR API Key miễn phí (Tùy chọn)

Để đảm bảo tính năng OCR chụp màn hình hoạt động ổn định và không bị nghẽn hạn ngạch:
1. Truy cập trang đăng ký miễn phí của OCR.space: [https://ocr.space/ocrapi/freekey](https://ocr.space/ocrapi/freekey)
2. Nhập Email và Tên của bạn $\rightarrow$ Nhấn **Register Free API Key**.
3. Mở Email để lấy mã API Key (dạng `K8xxxxxxxxxxxxx`).
4. Mở Popup của extension $\rightarrow$ Dán key vào ô **OCR API Key**. Hệ thống sẽ tự động lưu và áp dụng ngay lập tức. Nếu chưa nhập key, các tính năng OCR sẽ yêu cầu cấu hình thay vì dùng key mặc định.

---

## 📂 Cấu trúc mã nguồn (Project Structure)

```
Highlight-Word-Translate/
├── manifest.json        # File cấu hình Extension Manifest V3
├── background.js        # Service Worker xử lý Google GTX API Router, L2 Cache, OCR Dispatcher
├── content.js           # Content script điều khiển popup tooltip, bắt bôi đen chuột & 3 phím tắt
├── content.css          # Giao diện Scoped CSS cho popup tooltip và OCR overlay trên web
├── crop.html            # Giao diện trang chụp & cắt ảnh màn hình chất lượng cao
├── crop.js              # Xử lý canvas crop 2D, scale pixel ratio, OCR filter & kết quả dịch
├── popup.html           # Giao diện menu cài đặt (Toggles, 3 Custom Shortcut Recorders, OCR Key)
├── popup.css            # Styling giao diện Popup (Catppuccin Theme, Kbd badges, Error shakes)
├── popup.js             # Logic quản lý 3 phím tắt, chống trùng phím, và lưu trữ cấu hình
├── icons/               # Bộ icon ứng dụng (16x16, 48x48, 128x128)
└── README.md            # Tài liệu hướng dẫn sử dụng dự án
```

---

## 🔒 Quyền hạn & Bảo mật (Permissions & Privacy)

Extension tuân thủ nghiêm ngặt các tiêu chuẩn bảo mật của Chrome Manifest V3:
* `storage`: Lưu trữ cài đặt người dùng (ngôn ngữ đích, chế độ dịch, 3 phím tắt tùy chỉnh) cục bộ trên máy.
* `activeTab` & `tabs`: Cho phép chụp ảnh màn hình của tab hiện tại khi người dùng chủ động kích hoạt tính năng OCR.
* `clipboardWrite`: Hỗ trợ tính năng sao chép 1-click kết quả dịch vào bộ nhớ tạm.
* `host_permissions` (`<all_urls>`): Cần thiết để hàm chụp ảnh màn hình `captureVisibleTab` hoạt động trên mọi trang web khi nhấn phím tắt.
* **Không có máy chủ riêng để lưu lịch sử**: Extension không duy trì máy chủ riêng và không theo dõi lịch sử duyệt web. Tuy nhiên, văn bản người dùng chọn được gửi tới Google Translate để dịch; ảnh vùng chọn được gửi tới OCR.space khi dùng OCR. Người dùng nên xem chính sách riêng tư và điều khoản của các dịch vụ này trước khi sử dụng.

---

## 📄 Giấy phép (License)

Dự án được phân phối dưới giấy phép **MIT License**. Bạn hoàn toàn có thể tự do sử dụng, chỉnh sửa và phát triển thêm.
