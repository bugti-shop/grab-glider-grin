import UIKit
import UserNotifications
import UserNotificationsUI

/// Displayed when the user expands an alarm notification. iOS owns the lock
/// screen and notification actions; this extension cannot open by itself.
final class AlarmViewController: UIViewController, UNNotificationContentExtension {
    private let titleLabel = UILabel()
    private let priorityLabel = UILabel()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white

        let logo = UIImageView(image: UIImage(named: "AlarmLogo"))
        logo.contentMode = .scaleAspectFit
        logo.translatesAutoresizingMaskIntoConstraints = false
        logo.widthAnchor.constraint(equalToConstant: 78).isActive = true
        logo.heightAnchor.constraint(equalToConstant: 78).isActive = true

        let brand = UILabel()
        brand.text = "FLOWIST ALARM"
        brand.textColor = UIColor(red: 219/255, green: 37/255, blue: 45/255, alpha: 1)
        brand.font = .systemFont(ofSize: 13, weight: .bold)
        brand.textAlignment = .center

        titleLabel.font = .systemFont(ofSize: 26, weight: .bold)
        titleLabel.textColor = .black
        titleLabel.numberOfLines = 3
        titleLabel.textAlignment = .center

        priorityLabel.font = .systemFont(ofSize: 16, weight: .medium)
        priorityLabel.textColor = .darkGray
        priorityLabel.textAlignment = .center

        let stack = UIStackView(arrangedSubviews: [logo, brand, titleLabel, priorityLabel])
        stack.axis = .vertical
        stack.alignment = .center
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            stack.topAnchor.constraint(equalTo: view.topAnchor, constant: 24),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: view.bottomAnchor, constant: -24)
        ])
    }

    func didReceive(_ notification: UNNotification) {
        titleLabel.text = notification.request.content.title
        let priority = notification.request.content.userInfo["priority"] as? String ?? "None"
        priorityLabel.text = priority == "None" ? "Reminder" : "Priority · \(priority)"
    }
}