import { html } from "../lib/index.js";
import * as irc from "../lib/irc.js";

export default function Membership(props) {
	if (!this.props.value) {
		return null;
	}

	// XXX: If we were feeling creative we could generate unique colors for
	// each item in ISUPPORT CHANMODES. But I am not feeling creative.
	const CLASS_NAMES = { "~": "owner", "&": "admin", "@": "operator", "%": "halfop", "+": "voice" };
	const prefix = this.props.value[0];
	const className = CLASS_NAMES[prefix] || "";
	const name = irc.STD_MEMBERSHIP_NAMES[prefix] || "";
	return html`
		<span class="membership ${className}" title=${name}>
			${this.props.value}
		</span>
	`;
}
