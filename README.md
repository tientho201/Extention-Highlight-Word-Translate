# 🌐 Highlight Word Translate

> **Extension dịch thuật văn bản bôi đen & OCR chụp màn hình siêu tốc dành cho Google Chrome (Manifest V3).**

[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension%20MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![JavaScript](https://img.shields.io/badge/Language-Vanilla%20JavaScript-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![CSS3](https://img.shields.io/badge/Style-Catppuccin%20Mocha-89B4FA?logo=css3&logoColor=white)](https://github.com/catppuccin/catppuccin)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ Tính năng nổi bật

### 1. 🎯 2 Chế độ dịch văn bản bôi đen linh hoạt (Chỉ bật 1 trong 2):
* **Tự động dịch (Auto Translate)**: Khi bôi đen văn bản $\rightarrow$ vừa thả chuột là popup dịch xuất hiện tức thì ngay cạnh con trỏ chuột.
* **Dịch theo phím tắt (Shortcut Translate)**: Khi bôi đen chữ sẽ **không** tự hiện popup (tránh gây phiền khi đang đọc tài liệu). Chỉ khi bạn nhấn phím tắt (ví dụ: `Alt+T`, `Ctrl+Alt`, `Ctrl+Win`...) thì popup dịch mới xuất hiện ngay dưới đoạn văn bản được chọn.
* **Tắt cả 2**: Vô hiệu hóa tính năng dịch bôi đen khi không cần dùng.

### 2. ⌨️ Tùy chỉnh phím tắt dịch cực mạnh (Custom Shortcut Recorder):
* **Hỗ trợ đa dạng tổ hợp phím**:
  * Phím bổ trợ + Ký tự: `Alt+T`, `Ctrl+Q`, `Alt+D`, `Alt+Space`, `Ctrl+Shift+Z`...
  * **Phím bổ trợ thuần túy (Không cần ký tự)**: `Ctrl+Alt`, `Ctrl+Win`, `Alt+Shift`, `Ctrl+Shift`...
* **Tự động nhận diện hệ điều hành**: Tự động chuyển đổi giao diện và ký hiệu chuẩn giữa **Windows** (`Ctrl`, `Alt`, `Win`) và **macOS / MacBook** (`Control ⌃`, `Option ⌥`, `Cmd ⌘`, `Shift ⇧`).
* **Nút gợi ý nhanh 1-Click**: Có sẵn 4 phím tắt phổ biến trong Popup để chọn nhanh chỉ với 1 click.

### 3. 📸 2 Công cụ OCR chụp màn hình & Dịch hình ảnh:
* **Screen OCR Overlay (`Ctrl + Shift + X`)**: Kéo chọn trực tiếp vùng màn hình ngay trên trang web đang xem $\rightarrow$ tự động nhận diện chữ (OCR) và dịch tức thì.
* **Screenshot OCR Tool (`Alt + Shift + S`)**: Mở tab chụp toàn màn hình độ phân giải cao, hỗ trợ vẽ crop box tùy chỉnh và bộ lọc ảnh sắc nét để nhận diện chính xác nhất.
* **Hỗ trợ đa ngôn ngữ OCR**: Tự động fallback song ngữ (Latin `eng` và CJK `chs`/`cht`/`jpn`/`kor`).

### 4. 📚 Từ điển thông minh & Tra từ chi tiết:
* **Tra từ đơn**: Tự động hiển thị phiên âm chuẩn (Pinyin / Phonetic), loại từ (*Noun, Verb, Adjective...*), và danh sách tất cả các nét nghĩa chi tiết.
* **Dịch câu / đoạn văn**: Nhận diện thông minh ngữ cảnh, dịch mượt mà với hơn **15+ ngôn ngữ phổ biến** (*Tiếng Việt, Tiếng Anh, Tiếng Trung, Tiếng Nhật, Tiếng Hàn, Tiếng Pháp, Tiếng Đức...*).

### 5. 🔑 Cấu hình OCR API Key riêng (An toàn & Không lo nghẽn Quota):
* Cho phép người dùng tự điền **OCR.space API Key miễn phí** của riêng mình ngay trong Popup (có link 1-click đăng ký nhận key).
* Mỗi key riêng được cấp **500 lượt gọi OCR/ngày độc lập**, không lo bị dùng chung hay cạn kiệt hạn ngạch khi public extension.

### 6. 🎨 Trải nghiệm giao diện cao cấp (Catppuccin Mocha Dark Theme):
* Popup dịch có thể **kéo thả di chuyển (Draggable)** tự do trên trang web.
* Nút **sao chép nhanh (1-Click Copy)** kết quả dịch.
* **Cache 2 tầng siêu tốc (L1 Page Memory + L2 Service Worker Cache)**: Phản hồi kết quả gần như tức thì (< 5ms) đối với các từ đã tra cứu.

---

## ⌨️ Bảng phím tắt mặc định

| Tính năng | Windows / Linux | macOS / MacBook | Mô tả |
| :--- | :---: | :---: | :--- |
| **Dịch chữ bôi đen** *(Khi bật mode Phím tắt)* | `Alt + T` *(hoặc `Ctrl + Alt`)* | `Option ⌥ + T` *(hoặc `Control ⌃ + Option ⌥`)* | Bôi đen chữ rồi nhấn phím để hiện popup dịch |
| **OCR chọn vùng màn hình** | `Ctrl + Shift + X` | `Control ⌃ + Shift ⇧ + X` | Bật lớp phủ overlay để quét chữ trên ảnh/video |
| **OCR chụp toàn màn hình** | `Alt + Shift + S` | `Option ⌥ + Shift ⇧ + S` | Mở tab chụp full màn hình để crop & dịch |
| **Đóng Popup / Hủy OCR** | `Escape` | `Escape` | Tắt nhanh popup hoặc thoát chế độ OCR |

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

---

## 🔑 Hướng dẫn lấy OCR API Key miễn phí (Tùy chọn)

Để đảm bảo tính năng OCR chụp màn hình hoạt động ổn định và không bị nghẽn hạn ngạch:
1. Truy cập trang đăng ký miễn phí của OCR.space: [https://ocr.space/ocrapi/freekey](https://ocr.space/ocrapi/freekey)
2. Nhập Email và Tên của bạn $\rightarrow$ Nhấn **Register Free API Key**.
3. Mở Email để lấy mã API Key (dạng `K8xxxxxxxxxxxxx`).
4. Mở Popup của extension $\rightarrow$ Dán key vào ô **OCR API Key (Tùy chọn)**. Hệ thống sẽ tự động lưu và áp dụng ngay lập tức.

---

## 📂 Cấu trúc mã nguồn (Project Structure)

```
Highlight-Word-Translate/
├── manifest.json        # File cấu hình Extension Manifest V3
├── background.js        # Service Worker xử lý Google GTX API Router, L2 Cache, OCR Dispatcher
├── content.js           # Content script điều khiển popup tooltip, bắt bôi đen chuột & phím tắt
├── content.css          # Giao diện Scoped CSS cho popup tooltip và OCR overlay trên web
├── crop.html            # Giao diện trang chụp & cắt ảnh màn hình chất lượng cao
├── crop.js              # Xử lý canvas crop 2D, scale pixel ratio, OCR filter & kết quả dịch
├── popup.html           # Giao diện menu cài đặt extension (Toggles, Custom Shortcut, OCR Key)
├── popup.css            # Styling giao diện Popup (Catppuccin Theme, Kbd badges, animation)
├── popup.js             # Logic quản lý trạng thái, recorder phím tắt và lưu trữ cấu hình
├── icons/               # Bộ icon ứng dụng (16x16, 48x48, 128x128)
└── README.md            # Tài liệu hướng dẫn sử dụng dự án
```

---

## 🔒 Quyền hạn & Bảo mật (Permissions & Privacy)

Extension tuân thủ nghiêm ngặt các tiêu chuẩn bảo mật của Chrome Manifest V3:
* `storage`: Lưu trữ cài đặt người dùng (ngôn ngữ đích, chế độ dịch, phím tắt tùy chỉnh) cục bộ trên máy.
* `activeTab` & `tabs`: Cho phép chụp ảnh màn hình của tab hiện tại khi người dùng chủ động kích hoạt tính năng OCR.
* `clipboardWrite`: Hỗ trợ tính năng sao chép 1-click kết quả dịch vào bộ nhớ tạm.
* **Không thu thập dữ liệu**: Extension không lưu trữ, không theo dõi và không gửi bất kỳ thông tin cá nhân hay lịch sử duyệt web nào của người dùng về máy chủ bên thứ ba.

---

## 📄 Giấy phép (License)

Dự án được phân phối dưới giấy phép **MIT License**. Bạn hoàn toàn có thể tự do sử dụng, chỉnh sửa và phát triển thêm.
