export function installSlotMover(root: ParentNode = document): void {
	const move = (): void => {
		for (const template of Array.from(
			root.querySelectorAll<HTMLTemplateElement>("template[data-spira-slot]"),
		)) {
			const id = template.dataset.spiraSlot;
			if (id === undefined) {
				continue;
			}
			const slot = root.querySelector<HTMLElement>(`spira-slot[id="${id}"]`);
			if (slot === null) {
				continue;
			}
			for (const child of Array.from(slot.childNodes)) {
				child.remove();
			}
			slot.append(...Array.from(template.content.childNodes));
			template.remove();
		}
	};

	move();
	const observer = new MutationObserver(() => {
		move();
	});
	observer.observe(root, { childList: true, subtree: true });
}
